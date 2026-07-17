import { Router } from "express";
import { z } from "zod";
import { createSupabaseServiceRole } from "../lib/supabase";
import { normalizeEquipamentoEmpresa } from "../lib/equipamentoEmpresa";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";
import { assertCanWriteWebPage, loadWebWriteProfile, WebWriteAccessError } from "../lib/webWriteAccess";

const router = Router();

const empresaSelect = "id, nome, ativo, created_at, updated_at";

const createEmpresaSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, "Informe o nome da empresa.")
    .max(100)
    .transform((v) => normalizeEquipamentoEmpresa(v) ?? v.trim()),
  ativo: z.boolean().optional().default(true),
});

const updateEmpresaSchema = z
  .object({
    nome: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .transform((v) => normalizeEquipamentoEmpresa(v) ?? v.trim())
      .optional(),
    ativo: z.boolean().optional(),
  })
  .refine((v) => v.nome !== undefined || v.ativo !== undefined, {
    message: "Informe nome e/ou ativo para atualizar.",
  });

router.get("/empresas", requireAuth, async (req: AuthedRequest, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthorized" });

  const service = createSupabaseServiceRole();
  const onlyAtivas = String(req.query.ativas ?? "").toLowerCase() === "1" || req.query.ativas === "true";

  let query = service.from("empresas").select(empresaSelect).order("nome");
  if (onlyAtivas) query = query.eq("ativo", true);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ empresas: data ?? [] });
});

router.post("/empresas", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = createEmpresaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  const nome = parsed.data.nome;
  if (!nome) {
    return res.status(400).json({ error: { nome: ["Nome inválido."] } });
  }

  const service = createSupabaseServiceRole();

  try {
    const profile = await loadWebWriteProfile(service, req.userId!);
    assertCanWriteWebPage(profile, "equipamentos");
  } catch (e) {
    if (e instanceof WebWriteAccessError) return res.status(e.status).json({ error: e.message });
    throw e;
  }

  const { data: existentes } = await service.from("empresas").select("id, nome").ilike("nome", nome);
  const duplicada = (existentes ?? []).find(
    (e) => (normalizeEquipamentoEmpresa(e.nome) ?? "").toLowerCase() === nome.toLowerCase(),
  );
  if (duplicada) {
    return res.status(409).json({ error: `Já existe a empresa "${duplicada.nome}".`, empresa: duplicada });
  }

  const { data, error } = await service
    .from("empresas")
    .insert({ nome, ativo: parsed.data.ativo })
    .select(empresaSelect)
    .single();

  if (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: `Já existe uma empresa com o nome "${nome}".` });
    }
    return res.status(500).json({ error: error.message });
  }

  return res.status(201).json({ empresa: data });
});

router.patch("/empresas/:id", requireAuth, async (req: AuthedRequest, res) => {
  const id = String(req.params.id ?? "").trim();
  if (!id) return res.status(400).json({ error: "ID inválido." });

  const parsed = updateEmpresaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  const service = createSupabaseServiceRole();

  try {
    const profile = await loadWebWriteProfile(service, req.userId!);
    assertCanWriteWebPage(profile, "equipamentos");
  } catch (e) {
    if (e instanceof WebWriteAccessError) return res.status(e.status).json({ error: e.message });
    throw e;
  }

  const { data: existing } = await service.from("empresas").select("id").eq("id", id).maybeSingle();
  if (!existing) return res.status(404).json({ error: "Empresa não encontrada." });

  const patch: { nome?: string; ativo?: boolean } = {};
  if (parsed.data.nome !== undefined) patch.nome = parsed.data.nome;
  if (parsed.data.ativo !== undefined) patch.ativo = parsed.data.ativo;

  const { data, error } = await service
    .from("empresas")
    .update(patch)
    .eq("id", id)
    .select(empresaSelect)
    .single();

  if (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: `Já existe uma empresa com o nome "${patch.nome}".` });
    }
    return res.status(500).json({ error: error.message });
  }

  return res.json({ empresa: data });
});

router.delete("/empresas/:id", requireAuth, async (req: AuthedRequest, res) => {
  const id = String(req.params.id ?? "").trim();
  if (!id) return res.status(400).json({ error: "ID inválido." });

  const service = createSupabaseServiceRole();

  try {
    const profile = await loadWebWriteProfile(service, req.userId!);
    assertCanWriteWebPage(profile, "equipamentos");
  } catch (e) {
    if (e instanceof WebWriteAccessError) return res.status(e.status).json({ error: e.message });
    throw e;
  }

  const { data: existing } = await service
    .from("empresas")
    .select("id, nome")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return res.status(404).json({ error: "Empresa não encontrada." });

  const nomeNorm = normalizeEquipamentoEmpresa(existing.nome);
  if (nomeNorm) {
    const { count, error: countErr } = await service
      .from("equipamentos")
      .select("*", { count: "exact", head: true })
      .eq("tipo", "EQUIPAMENTO")
      .ilike("empresa", nomeNorm);
    if (countErr) return res.status(500).json({ error: countErr.message });
    if ((count ?? 0) > 0) {
      return res.status(409).json({
        error: `Não é possível excluir: há ${count} equipamento(s) com a empresa "${existing.nome}". Desative a empresa ou troque os equipamentos antes.`,
      });
    }
  }

  const { error } = await service.from("empresas").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true, id });
});

export default router;
