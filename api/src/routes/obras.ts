import { Router } from "express";
import { z } from "zod";
import { createSupabaseServiceRole } from "../lib/supabase";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";
import { requireAdmin } from "../middleware/requireAdmin";

const router = Router();

const createObraSchema = z.object({
  codigo: z.coerce.number().int().positive(),
  nome: z.string().trim().min(1).max(300),
});

router.get("/obras", requireAuth, async (_req: AuthedRequest, res) => {
  const service = createSupabaseServiceRole();
  const { data, error } = await service.from("obras").select("codigo, nome").order("codigo");
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ obras: data ?? [] });
});

router.post("/obras", requireAdmin, async (req: AuthedRequest, res) => {
  const parsed = createObraSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  const { codigo, nome } = parsed.data;
  const service = createSupabaseServiceRole();

  const { data: existing } = await service.from("obras").select("codigo").eq("codigo", codigo).maybeSingle();
  if (existing) {
    return res.status(409).json({ error: `Já existe uma obra com o código ${codigo}.` });
  }

  const { data, error } = await service.from("obras").insert({ codigo, nome }).select("codigo, nome").single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ obra: data });
});

router.get("/ping", requireAuth, async (_req: AuthedRequest, res) => res.json({ ok: true }));

export default router;

