import { Router } from "express";
import { z } from "zod";

const router = Router();

const mobileErrorSchema = z
  .object({
    kind: z.string().optional(),
    message: z.string(),
    stack: z.string().optional(),
    at: z.string().optional(),
    path: z.string().optional(),
    status: z.number().optional(),
    operation_id: z.string().optional(),
    action: z.string().optional(),
    tipo: z.string().optional(),
    meta: z.record(z.any()).optional(),
  })
  .passthrough();

router.post("/debug/mobile-error", async (req, res) => {
  const parsed = mobileErrorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const p = parsed.data;

  // Log “no mesmo terminal da API” pra facilitar debug.
  // eslint-disable-next-line no-console
  console.error(`[MOBILE] ${p.kind ?? "error"}: ${p.message}`);
  if (p.at) {
    // eslint-disable-next-line no-console
    console.error(`[MOBILE] at: ${p.at}`);
  }
  if (p.path) {
    // eslint-disable-next-line no-console
    console.error(`[MOBILE] request: ${p.path} ${p.status ? `-> ${p.status}` : ""}`);
  }
  if (p.operation_id) {
    // eslint-disable-next-line no-console
    console.error(`[MOBILE] operation_id: ${p.operation_id}`);
  }
  if (p.action) {
    // eslint-disable-next-line no-console
    console.error(`[MOBILE] action: ${p.action}`);
  }
  if (p.tipo) {
    // eslint-disable-next-line no-console
    console.error(`[MOBILE] tipo: ${p.tipo}`);
  }
  if (p.stack) {
    // eslint-disable-next-line no-console
    console.error(p.stack);
  }
  if (p.meta) {
    // eslint-disable-next-line no-console
    console.error("[MOBILE] meta:", p.meta);
  }

  return res.json({ ok: true });
});

export default router;

