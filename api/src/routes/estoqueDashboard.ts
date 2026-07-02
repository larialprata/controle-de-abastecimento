import { Router } from "express";
import { createSupabaseServiceRole } from "../lib/supabase";
import { buildEstoqueDashboard } from "../lib/estoqueDashboard";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";
import { getUserObraCodigos } from "../lib/userObras";

const router = Router();

router.get("/estoque/dashboard", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });

    const service = createSupabaseServiceRole();
    const obraScope = await getUserObraCodigos(service, req.userId);
    const obraCodigoRaw =
      typeof req.query.obra_codigo === "string" ? Number(req.query.obra_codigo) : null;
    const obraCodigo = obraCodigoRaw != null && Number.isFinite(obraCodigoRaw) ? obraCodigoRaw : null;

    if (obraCodigo != null && obraScope && !obraScope.includes(obraCodigo)) {
      return res.status(403).json({ error: "Sem acesso a esta obra." });
    }

    const dashboard = await buildEstoqueDashboard(service, { obraCodigo, obraScope });
    return res.json(dashboard);
  } catch (err: unknown) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Erro ao montar estoque.",
    });
  }
});

export default router;
