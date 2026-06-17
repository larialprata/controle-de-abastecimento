import { Router } from "express";
import { z } from "zod";
import { createSupabaseServiceRole } from "../lib/supabase";
import { parseObraCodigoInput } from "../lib/obraCodigo";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";
import { requireAdmin } from "../middleware/requireAdmin";

const router = Router();

export const OBRA_EMPRESAS = ["DIMENSIONAL", "DELURB"] as const;
export type ObraEmpresa = (typeof OBRA_EMPRESAS)[number];

const obraEmpresaSchema = z.enum(OBRA_EMPRESAS);

const createObraSchema = z.object({
  codigo: z.preprocess(
    (val) => parseObraCodigoInput(val) ?? val,
    z.number().int().positive(),
  ),
  nome: z.string().trim().min(1).max(300),
  empresa: obraEmpresaSchema,
});

const updateObraSchema = z
  .object({
    nome: z.string().trim().min(1).max(300).optional(),
    empresa: obraEmpresaSchema.optional(),
  })
  .refine((v) => v.nome !== undefined || v.empresa !== undefined, {
    message: "Informe nome e/ou empresa para atualizar.",
  });

const obraSelect = "codigo, nome, empresa";

router.get("/obras", requireAuth, async (_req: AuthedRequest, res) => {
  const service = createSupabaseServiceRole();
  const { data, error } = await service.from("obras").select(obraSelect).order("codigo");
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ obras: data ?? [] });
});

router.post("/obras", requireAdmin, async (req: AuthedRequest, res) => {
  const parsed = createObraSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  const codigo = parsed.data.codigo;
  const { nome, empresa } = parsed.data;
  const service = createSupabaseServiceRole();

  const { data: existing } = await service.from("obras").select("codigo").eq("codigo", codigo).maybeSingle();
  if (existing) {
    return res.status(409).json({ error: `Já existe uma obra com o código ${codigo}.` });
  }

  const { data, error } = await service
    .from("obras")
    .insert({ codigo, nome, empresa })
    .select(obraSelect)
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ obra: data });
});

router.patch("/obras/:codigo", requireAdmin, async (req: AuthedRequest, res) => {
  const codigo = Number(req.params.codigo);
  if (!Number.isFinite(codigo) || codigo <= 0) {
    return res.status(400).json({ error: "Código inválido." });
  }

  const parsed = updateObraSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  const service = createSupabaseServiceRole();
  const { data: existing } = await service.from("obras").select("codigo").eq("codigo", codigo).maybeSingle();
  if (!existing) {
    return res.status(404).json({ error: `Obra ${codigo} não encontrada.` });
  }

  const patch: { nome?: string; empresa?: ObraEmpresa } = {};
  if (parsed.data.nome !== undefined) patch.nome = parsed.data.nome;
  if (parsed.data.empresa !== undefined) patch.empresa = parsed.data.empresa;

  const { data, error } = await service.from("obras").update(patch).eq("codigo", codigo).select(obraSelect).single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ obra: data });
});

router.get("/ping", requireAuth, async (_req: AuthedRequest, res) => res.json({ ok: true }));

export default router;
