import { Router } from "express";
import { createSupabaseServiceRole } from "../lib/supabase";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";
import { getUserObraCodigos } from "../lib/userObras";
import { buildAlertasDashboard } from "../lib/alertasRoubo";

const router = Router();

router.get("/alertas", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });

    const obraCodigoRaw =
      typeof req.query.obra_codigo === "string" ? Number(req.query.obra_codigo) : null;
    const obraCodigo = obraCodigoRaw != null && Number.isFinite(obraCodigoRaw) ? obraCodigoRaw : null;

    const service = createSupabaseServiceRole();
    const obraScope = await getUserObraCodigos(service, req.userId);
    if (obraCodigo != null && obraScope && !obraScope.includes(obraCodigo)) {
      return res.status(403).json({ error: "Sem acesso a esta obra." });
    }

    const de = typeof req.query.de === "string" && req.query.de.trim() ? req.query.de.trim() : null;
    const ate = typeof req.query.ate === "string" && req.query.ate.trim() ? req.query.ate.trim() : null;

    const data = await buildAlertasDashboard(service, { de, ate, obraCodigo }, obraScope);
    return res.json(data);
  } catch (err: unknown) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Erro ao carregar alertas.",
    });
  }
});

export default router;
