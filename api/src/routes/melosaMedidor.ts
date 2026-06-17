import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";

const router = Router();

/** Legado: continuidade do medidor acumulado foi substituída por quantidade abastecida direta. */
router.get("/melosa-medidor/esperado", requireAuth, async (req: AuthedRequest, res) => {
  const ativo = typeof req.query.ativo === "string" ? req.query.ativo.trim() : "";
  if (!ativo) return res.status(400).json({ error: "Informe o parâmetro ativo (melosa)." });

  return res.json({
    ativo_melosa: ativo.toUpperCase(),
    medidor_esperado: null,
    ultimo_abastecimento: null,
  });
});

router.get("/melosa-medidor/desvios", requireAuth, async (_req: AuthedRequest, res) => {
  return res.json({ desvios: [], total: 0 });
});

export default router;
