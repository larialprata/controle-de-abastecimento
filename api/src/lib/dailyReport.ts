import { createSupabaseServiceRole } from "./supabase";
import { sendEmail, isEmailConfigured } from "./email";

export type ReportSubscription = {
  id: string;
  email: string;
  nome: string | null;
  obra_codigos: number[];
  ativo: boolean;
};

type DayWindow = { startIso: string; endIso: string; label: string };

/** Dia civil em America/Sao_Paulo (hoje - 0) ou offsetDays. */
export function saoPauloDayWindow(offsetDays = 0): DayWindow {
  const now = new Date();
  const spParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = Number(spParts.find((p) => p.type === "year")?.value);
  const m = Number(spParts.find((p) => p.type === "month")?.value);
  const d = Number(spParts.find((p) => p.type === "day")?.value);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + offsetDays);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(base.getUTCDate()).padStart(2, "0");
  const label = `${dd}/${mm}/${yy}`;
  // America/Sao_Paulo ≈ UTC-3 (sem DST desde 2019)
  const startIso = `${yy}-${mm}-${dd}T03:00:00.000Z`;
  const endDate = new Date(Date.UTC(yy, base.getUTCMonth(), base.getUTCDate() + 1));
  const ey = endDate.getUTCFullYear();
  const em = String(endDate.getUTCMonth() + 1).padStart(2, "0");
  const ed = String(endDate.getUTCDate()).padStart(2, "0");
  const endIso = `${ey}-${em}-${ed}T03:00:00.000Z`;
  return { startIso, endIso, label };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function hasPath(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

type ObraAgg = {
  codigo: number;
  nome: string;
  abastecimentos: number;
  litrosAbastecidos: number;
  semFotoQtd: number;
  entradasTanque: number;
  litrosEntrada: number;
  retiradasTanque: number;
  litrosRetirada: number;
};

async function buildAggsForObras(
  service: ReturnType<typeof createSupabaseServiceRole>,
  obraCodigos: number[],
  day: DayWindow,
): Promise<ObraAgg[]> {
  if (obraCodigos.length === 0) return [];

  const { data: obrasRows } = await service
    .from("obras")
    .select("codigo, nome")
    .in("codigo", obraCodigos);

  const nomeByCodigo = new Map<number, string>();
  for (const o of obrasRows ?? []) {
    nomeByCodigo.set(Number(o.codigo), String(o.nome ?? ""));
  }

  const { data: melosas } = await service
    .from("melosa_movimentacoes")
    .select(
      "obra_codigo, litros, melosa_quantidade_abastecida, melosa_quantidade_abastecida_storage_path",
    )
    .in("obra_codigo", obraCodigos)
    .gte("data_hora", day.startIso)
    .lt("data_hora", day.endIso);

  const { data: tanques } = await service
    .from("movimentacoes")
    .select("obra_codigo, tipo, litros")
    .in("obra_codigo", obraCodigos)
    .gte("data_hora", day.startIso)
    .lt("data_hora", day.endIso);

  const byObra = new Map<number, ObraAgg>();
  for (const codigo of obraCodigos) {
    byObra.set(codigo, {
      codigo,
      nome: nomeByCodigo.get(codigo) ?? "",
      abastecimentos: 0,
      litrosAbastecidos: 0,
      semFotoQtd: 0,
      entradasTanque: 0,
      litrosEntrada: 0,
      retiradasTanque: 0,
      litrosRetirada: 0,
    });
  }

  for (const row of melosas ?? []) {
    const codigo = Number(row.obra_codigo);
    const agg = byObra.get(codigo);
    if (!agg) continue;
    agg.abastecimentos += 1;
    const litros =
      num(row.litros) ||
      num(String(row.melosa_quantidade_abastecida ?? "").replace(",", "."));
    agg.litrosAbastecidos += litros;
    if (!hasPath(row.melosa_quantidade_abastecida_storage_path)) agg.semFotoQtd += 1;
  }

  for (const row of tanques ?? []) {
    const codigo = Number(row.obra_codigo);
    const agg = byObra.get(codigo);
    if (!agg) continue;
    const litros = num(row.litros);
    const tipo = String(row.tipo ?? "").toUpperCase();
    if (tipo.includes("ENTRADA")) {
      agg.entradasTanque += 1;
      agg.litrosEntrada += litros;
    } else if (tipo.includes("RETIRADA")) {
      agg.retiradasTanque += 1;
      agg.litrosRetirada += litros;
    }
  }

  return obraCodigos.map((c) => byObra.get(c)!).filter(Boolean);
}

function formatLitros(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function buildEmailBodies(sub: ReportSubscription, day: DayWindow, aggs: ObraAgg[]): {
  subject: string;
  text: string;
  html: string;
} {
  const obrasLabel = aggs.map((a) => a.codigo).join(", ");
  const subject = `Relatório diário de abastecimento — ${day.label} (obras ${obrasLabel})`;

  const lines: string[] = [
    sub.nome ? `Olá, ${sub.nome}!` : "Olá!",
    "",
    `Resumo do dia ${day.label} (horário de Brasília) para as obras: ${obrasLabel}.`,
    "",
  ];

  for (const a of aggs) {
    const nome = a.nome ? ` — ${a.nome}` : "";
    lines.push(`Obra ${a.codigo}${nome}`);
    lines.push(`  • Abastecimentos (melosa): ${a.abastecimentos} · ${formatLitros(a.litrosAbastecidos)} L`);
    if (a.semFotoQtd > 0) {
      lines.push(`  • Atenção: ${a.semFotoQtd} abastecimento(s) sem foto da quantidade`);
    }
    lines.push(
      `  • Tanque: ${a.entradasTanque} entrada(s) (${formatLitros(a.litrosEntrada)} L) · ${a.retiradasTanque} retirada(s) (${formatLitros(a.litrosRetirada)} L)`,
    );
    lines.push("");
  }

  const totalAbast = aggs.reduce((s, a) => s + a.abastecimentos, 0);
  const totalLitros = aggs.reduce((s, a) => s + a.litrosAbastecidos, 0);
  const totalSemFoto = aggs.reduce((s, a) => s + a.semFotoQtd, 0);
  lines.push(`Total: ${totalAbast} abastecimentos · ${formatLitros(totalLitros)} L`);
  if (totalSemFoto > 0) lines.push(`Pendências de foto (quantidade): ${totalSemFoto}`);
  lines.push("");
  lines.push("— Controle de Abastecimento");

  const text = lines.join("\n");

  const rowsHtml = aggs
    .map((a) => {
      const nome = a.nome ? ` — ${escapeHtml(a.nome)}` : "";
      const alerta =
        a.semFotoQtd > 0
          ? `<div style="color:#b45309;font-size:13px;margin-top:4px;">${a.semFotoQtd} sem foto da quantidade</div>`
          : "";
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
            <strong>Obra ${a.codigo}</strong>${nome}
            ${alerta}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${a.abastecimentos}<br/><span style="color:#64748b;font-size:12px;">${formatLitros(a.litrosAbastecidos)} L</span></td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:13px;">
            +${a.entradasTanque} (${formatLitros(a.litrosEntrada)} L)<br/>
            −${a.retiradasTanque} (${formatLitros(a.litrosRetirada)} L)
          </td>
        </tr>`;
    })
    .join("");

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:24px;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:#0f766e;color:#fff;padding:16px 20px;">
      <div style="font-size:18px;font-weight:700;">Relatório diário</div>
      <div style="opacity:.9;font-size:13px;margin-top:4px;">${escapeHtml(day.label)} · obras ${escapeHtml(obrasLabel)}</div>
    </div>
    <div style="padding:16px 20px;">
      <p style="margin:0 0 12px;font-size:14px;">${sub.nome ? `Olá, ${escapeHtml(sub.nome)}!` : "Olá!"} Resumo do dia nas obras que você acompanha:</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#f8fafc;text-align:left;">
            <th style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">Obra</th>
            <th style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">Abastecimentos</th>
            <th style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">Tanque</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <p style="margin:16px 0 0;font-size:13px;color:#475569;">
        Total: <strong>${totalAbast}</strong> abastecimentos · <strong>${formatLitros(totalLitros)} L</strong>
        ${totalSemFoto > 0 ? ` · <span style="color:#b45309;">${totalSemFoto} sem foto da quantidade</span>` : ""}
      </p>
    </div>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type DailyReportRunResult = {
  day: string;
  sent: number;
  skipped: number;
  failures: { email: string; error: string }[];
};

export async function runDailyReportEmails(opts?: {
  offsetDays?: number;
  /** Se informado, envia só para estes user_ids */
  userIds?: string[];
}): Promise<DailyReportRunResult> {
  if (!isEmailConfigured()) {
    throw new Error("E-mail não configurado (RESEND_API_KEY ou SMTP_HOST/SMTP_FROM).");
  }

  const service = createSupabaseServiceRole();
  const day = saoPauloDayWindow(opts?.offsetDays ?? 0);

  let query = service
    .from("profiles")
    .select("user_id, email, full_name, recebe_relatorio_email, active")
    .eq("recebe_relatorio_email", true)
    .eq("active", true);

  if (opts?.userIds?.length) {
    query = query.in("user_id", opts.userIds);
  }

  const { data: profiles, error } = await query;
  if (error) throw new Error(error.message);

  const { data: allObras, error: obrasErr } = await service.from("obras").select("codigo");
  if (obrasErr) throw new Error(obrasErr.message);
  const todosCodigos = (allObras ?? [])
    .map((o) => Number(o.codigo))
    .filter((n) => Number.isFinite(n) && n > 0);

  const result: DailyReportRunResult = {
    day: day.label,
    sent: 0,
    skipped: 0,
    failures: [],
  };

  for (const prof of profiles ?? []) {
    const userId = String(prof.user_id ?? "");
    let email = typeof prof.email === "string" ? prof.email.trim().toLowerCase() : "";
    if (!userId) {
      result.skipped += 1;
      continue;
    }
    if (!email || !email.includes("@")) {
      const { data: authData } = await service.auth.admin.getUserById(userId);
      email = (authData?.user?.email ?? "").trim().toLowerCase();
    }
    if (!email || !email.includes("@")) {
      result.skipped += 1;
      continue;
    }

    try {
      const { data: obraRows, error: poErr } = await service
        .from("profile_obras")
        .select("obra_codigo")
        .eq("user_id", userId);
      if (poErr) throw new Error(poErr.message);

      const vinculadas = (obraRows ?? [])
        .map((r) => Number(r.obra_codigo))
        .filter((n) => Number.isFinite(n) && n > 0);
      const obraCodigos = vinculadas.length > 0 ? vinculadas : todosCodigos;

      if (obraCodigos.length === 0) {
        result.skipped += 1;
        continue;
      }

      const sub: ReportSubscription = {
        id: userId,
        email,
        nome: typeof prof.full_name === "string" ? prof.full_name : null,
        obra_codigos: obraCodigos,
        ativo: true,
      };
      const aggs = await buildAggsForObras(service, obraCodigos, day);
      const body = buildEmailBodies(sub, day, aggs);
      await sendEmail({ to: email, ...body });
      result.sent += 1;
    } catch (e: unknown) {
      result.failures.push({
        email,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return result;
}

/** Hora atual (0–23) em America/Sao_Paulo. */
export function saoPauloHourNow(): number {
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "numeric",
    hour12: false,
  }).format(new Date());
  return Number(hourStr);
}
