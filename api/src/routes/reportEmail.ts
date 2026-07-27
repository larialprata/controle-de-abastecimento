import { Router } from "express";
import { envValidated } from "../config";
import { createSupabaseServiceRole, createSupabaseAnonWithToken } from "../lib/supabase";
import { runDailyReportEmails, saoPauloHourNow } from "../lib/dailyReport";
import { isEmailConfigured } from "../lib/email";

const router = Router();

/** Disparo manual (admin) ou via cron externo com CRON_SECRET. */
router.post("/report-email/run-daily", async (req, res) => {
  try {
    const cronSecret = envValidated.CRON_SECRET?.trim();
    const headerSecret = String(req.headers["x-cron-secret"] ?? "").trim();
    const isCron = Boolean(cronSecret && headerSecret && headerSecret === cronSecret);

    if (!isCron) {
      const authHeader = String(req.headers.authorization ?? "");
      const match = authHeader.match(/^Bearer (.+)$/);
      if (!match) return res.status(401).json({ error: "Unauthorized" });
      const userClient = createSupabaseAnonWithToken(match[1]);
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData.user) return res.status(401).json({ error: "Unauthorized" });
      const service = createSupabaseServiceRole();
      const { data: profile } = await service
        .from("profiles")
        .select("role")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if (profile?.role !== "admin") return res.status(403).json({ error: "Apenas admin" });
    }

    const offsetDays = Number(req.body?.offsetDays ?? 0);
    const result = await runDailyReportEmails({
      offsetDays: Number.isFinite(offsetDays) ? offsetDays : 0,
    });
    if (result.failures.length) {
      console.error("[daily-report] Falhas:", result.failures);
    }
    return res.json({
      ok: true,
      email_configured: isEmailConfigured(),
      ...result,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

export function startDailyReportScheduler() {
  const hour = envValidated.DAILY_REPORT_HOUR;
  if (hour == null || !Number.isFinite(hour) || hour < 0 || hour > 23) {
    console.log("[daily-report] Agendamento interno desligado (defina DAILY_REPORT_HOUR=18, por ex.).");
    return;
  }
  if (!isEmailConfigured()) {
    console.log("[daily-report] SMTP não configurado — agendamento ignorado.");
    return;
  }

  let lastSentKey: string | null = null;
  const tick = async () => {
    try {
      const nowHour = saoPauloHourNow();
      if (nowHour !== hour) return;
      const dayKey = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const sentKey = `${dayKey}@${hour}`;
      if (lastSentKey === sentKey) return;
      console.log(`[daily-report] Disparando relatório diário (${dayKey} ${hour}h BRT)...`);
      const result = await runDailyReportEmails({ offsetDays: 0 });
      lastSentKey = sentKey;
      console.log(
        `[daily-report] Enviados=${result.sent} skipped=${result.skipped} falhas=${result.failures.length}`,
      );
    } catch (e) {
      console.error("[daily-report] Erro no agendamento:", e);
    }
  };

  setInterval(() => {
    void tick();
  }, 60_000);
  console.log(`[daily-report] Agendamento ativo: envio às ${hour}h (America/Sao_Paulo).`);
}

export default router;
