import { Router } from "express";
import { z } from "zod";
import { createSupabaseServiceRole } from "../lib/supabase";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";
import { requireAdmin } from "../middleware/requireAdmin";

const router = Router();

const createEquipamentoSchema = z.object({
  ativo: z.string().trim().min(1).max(100),
  nome: z.string().trim().min(1).max(300),
});

router.get("/equipamentos", requireAuth, async (_req: AuthedRequest, res) => {
  const service = createSupabaseServiceRole();
  const { data, error } = await service.from("equipamentos").select("ativo, nome").order("ativo");
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ equipamentos: data ?? [] });
});

router.post("/equipamentos", requireAdmin, async (req: AuthedRequest, res) => {
  const parsed = createEquipamentoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  const { ativo, nome } = parsed.data;
  const service = createSupabaseServiceRole();

  const { data: existing } = await service
    .from("equipamentos")
    .select("ativo")
    .ilike("ativo", ativo)
    .maybeSingle();
  if (existing) {
    return res.status(409).json({ error: `Já existe um equipamento com o ativo ${existing.ativo}.` });
  }

  const { data, error } = await service
    .from("equipamentos")
    .insert({ ativo, nome })
    .select("ativo, nome")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ equipamento: data });
});

export default router;
