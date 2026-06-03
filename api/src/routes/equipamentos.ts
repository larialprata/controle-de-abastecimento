import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";

const router = Router();

/**
 * Compatibilidade: builds antigos do app ainda chamam GET /v1/equipamentos.
 * O cadastro por equipamento foi removido; devolve lista vazia (evita HTTP 404).
 */
router.get("/equipamentos", requireAuth, async (_req: AuthedRequest, res) => {
  return res.json({ equipamentos: [] });
});

export default router;
