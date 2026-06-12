import { Router } from "express";
import { z } from "zod";
import { createSupabaseServiceRole } from "../lib/supabase";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";
import { requireAdmin } from "../middleware/requireAdmin";

const router = Router();

const equipamentoTipoSchema = z.enum(["TANQUE", "MELOSA"]);

const createEquipamentoSchema = z
  .object({
    ativo: z.string().trim().min(1).max(100),
    nome: z.string().trim().max(300).optional(),
    tipo: equipamentoTipoSchema,
    obra_codigo: z.number().int().positive().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.tipo === "MELOSA" && data.obra_codigo != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Melosa não pode ser vinculada a uma obra.",
        path: ["obra_codigo"],
      });
    }
    if (data.tipo === "TANQUE" && data.nome != null && data.nome.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe uma descrição para o tanque.",
        path: ["nome"],
      });
    }
  });

router.get("/equipamentos", requireAuth, async (req: AuthedRequest, res) => {
  const tipoRaw = typeof req.query.tipo === "string" ? req.query.tipo.toUpperCase() : undefined;
  const obraRaw = typeof req.query.obra_codigo === "string" ? Number(req.query.obra_codigo) : undefined;

  const service = createSupabaseServiceRole();
  let query = service.from("equipamentos").select("ativo, nome, tipo, obra_codigo").order("ativo");

  if (tipoRaw === "TANQUE" || tipoRaw === "MELOSA") {
    query = query.eq("tipo", tipoRaw);
  }
  if (obraRaw != null && Number.isFinite(obraRaw)) {
    query = query.eq("obra_codigo", obraRaw);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ equipamentos: data ?? [] });
});

router.post("/equipamentos", requireAdmin, async (req: AuthedRequest, res) => {
  const parsed = createEquipamentoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  const { ativo, tipo, obra_codigo } = parsed.data;
  const nome = parsed.data.nome?.trim() || ativo;
  const service = createSupabaseServiceRole();

  if (tipo === "TANQUE" && obra_codigo != null) {
    const { data: obra, error: obraErr } = await service.from("obras").select("codigo").eq("codigo", obra_codigo).maybeSingle();
    if (obraErr) return res.status(500).json({ error: obraErr.message });
    if (!obra) return res.status(400).json({ error: "Obra não encontrada." });
  }

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
    .insert({
      ativo,
      nome,
      tipo,
      obra_codigo: tipo === "TANQUE" ? (obra_codigo ?? null) : null,
    })
    .select("ativo, nome, tipo, obra_codigo")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ equipamento: data });
});

const updateEquipamentoSchema = z
  .object({
    ativo: z.string().trim().min(1).max(100).optional(),
    nome: z.string().trim().max(300).optional(),
    tipo: equipamentoTipoSchema.optional(),
    obra_codigo: z.number().int().positive().nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.tipo === "MELOSA" && data.obra_codigo != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Melosa não pode ser vinculada a uma obra.",
        path: ["obra_codigo"],
      });
    }
  });

router.patch("/equipamentos/:ativo", requireAdmin, async (req: AuthedRequest, res) => {
  const ativoAtual = decodeURIComponent(req.params.ativo ?? "").trim();
  if (!ativoAtual) {
    return res.status(400).json({ error: "Ativo inválido." });
  }

  const parsed = updateEquipamentoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }
  if (Object.keys(parsed.data).length === 0) {
    return res.status(400).json({ error: "Nenhum campo para atualizar." });
  }

  const service = createSupabaseServiceRole();
  const { data: existing, error: findErr } = await service
    .from("equipamentos")
    .select("ativo, nome, tipo, obra_codigo")
    .eq("ativo", ativoAtual)
    .maybeSingle();
  if (findErr) return res.status(500).json({ error: findErr.message });
  if (!existing) {
    return res.status(404).json({ error: `Equipamento ${ativoAtual} não encontrado.` });
  }

  const tipo = parsed.data.tipo ?? existing.tipo;
  const ativoNovo = parsed.data.ativo?.trim() ?? existing.ativo;
  const nomeRaw = parsed.data.nome !== undefined ? parsed.data.nome.trim() : (existing.nome ?? "");
  const nome = nomeRaw || ativoNovo;

  if (tipo === "TANQUE" && !nomeRaw) {
    return res.status(400).json({ error: "Informe uma descrição para o tanque." });
  }

  let obra_codigo: number | null;
  if (tipo === "MELOSA") {
    obra_codigo = null;
  } else if (parsed.data.obra_codigo !== undefined) {
    obra_codigo = parsed.data.obra_codigo;
  } else {
    obra_codigo = existing.obra_codigo;
  }

  if (tipo === "TANQUE" && obra_codigo != null) {
    const { data: obra, error: obraErr } = await service.from("obras").select("codigo").eq("codigo", obra_codigo).maybeSingle();
    if (obraErr) return res.status(500).json({ error: obraErr.message });
    if (!obra) return res.status(400).json({ error: "Obra não encontrada." });
  }

  if (ativoNovo.toLowerCase() !== ativoAtual.toLowerCase()) {
    const { data: duplicate } = await service
      .from("equipamentos")
      .select("ativo")
      .ilike("ativo", ativoNovo)
      .maybeSingle();
    if (duplicate) {
      return res.status(409).json({ error: `Já existe um equipamento com o ativo ${duplicate.ativo}.` });
    }
  }

  const { data, error } = await service
    .from("equipamentos")
    .update({
      ativo: ativoNovo,
      nome,
      tipo,
      obra_codigo,
    })
    .eq("ativo", ativoAtual)
    .select("ativo, nome, tipo, obra_codigo")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ equipamento: data });
});

router.delete("/equipamentos/:ativo", requireAdmin, async (req: AuthedRequest, res) => {
  const ativo = decodeURIComponent(req.params.ativo ?? "").trim();
  if (!ativo) {
    return res.status(400).json({ error: "Ativo inválido." });
  }

  const service = createSupabaseServiceRole();
  const { data: existing, error: findErr } = await service
    .from("equipamentos")
    .select("ativo")
    .eq("ativo", ativo)
    .maybeSingle();
  if (findErr) return res.status(500).json({ error: findErr.message });
  if (!existing) {
    return res.status(404).json({ error: `Equipamento ${ativo} não encontrado.` });
  }

  const { error } = await service.from("equipamentos").delete().eq("ativo", ativo);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
});

export default router;
