import { Router } from "express";
import { z } from "zod";
import { createSupabaseServiceRole } from "../lib/supabase";
import { parseObraCodigoInput } from "../lib/obraCodigo";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";
import { getUserObraCodigos } from "../lib/userObras";
import { assertCanWriteWebPage, loadWebWriteProfile, WebWriteAccessError } from "../lib/webWriteAccess";

const router = Router();

export const OBRA_EMPRESAS = ["DIMENSIONAL", "DELURB", "SPE_IGARATA"] as const;
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

router.get("/obras", requireAuth, async (req: AuthedRequest, res) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthorized" });
  const service = createSupabaseServiceRole();
  let query = service.from("obras").select(obraSelect).order("codigo");

  const obraScope = await getUserObraCodigos(service, req.userId);
  if (obraScope) query = query.in("codigo", obraScope);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ obras: data ?? [] });
});

router.post("/obras", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = createObraSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  const codigo = parsed.data.codigo;
  const { nome, empresa } = parsed.data;
  const service = createSupabaseServiceRole();

  try {
    const profile = await loadWebWriteProfile(service, req.userId!);
    assertCanWriteWebPage(profile, "contratos");
  } catch (e) {
    if (e instanceof WebWriteAccessError) return res.status(e.status).json({ error: e.message });
    throw e;
  }

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

router.patch("/obras/:codigo", requireAuth, async (req: AuthedRequest, res) => {
  const codigo = Number(req.params.codigo);
  if (!Number.isFinite(codigo) || codigo <= 0) {
    return res.status(400).json({ error: "Código inválido." });
  }

  const parsed = updateObraSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  const service = createSupabaseServiceRole();

  try {
    const profile = await loadWebWriteProfile(service, req.userId!);
    assertCanWriteWebPage(profile, "contratos");
  } catch (e) {
    if (e instanceof WebWriteAccessError) return res.status(e.status).json({ error: e.message });
    throw e;
  }

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

async function countObraReferencias(service: ReturnType<typeof createSupabaseServiceRole>, codigo: number) {
  const tables = ["movimentacoes", "melosa_movimentacoes", "equipamentos", "melosa_ciclos"] as const;
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const { count, error } = await service
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("obra_codigo", codigo);
    if (error) throw error;
    counts[table] = count ?? 0;
  }
  return counts;
}

router.delete("/obras/:codigo", requireAuth, async (req: AuthedRequest, res) => {
  const codigo = Number(req.params.codigo);
  if (!Number.isFinite(codigo) || codigo <= 0) {
    return res.status(400).json({ error: "Código inválido." });
  }

  const service = createSupabaseServiceRole();

  try {
    const profile = await loadWebWriteProfile(service, req.userId!);
    assertCanWriteWebPage(profile, "contratos");
  } catch (e) {
    if (e instanceof WebWriteAccessError) return res.status(e.status).json({ error: e.message });
    throw e;
  }

  const { data: existing } = await service.from("obras").select("codigo").eq("codigo", codigo).maybeSingle();
  if (!existing) {
    return res.status(404).json({ error: `Obra ${codigo} não encontrada.` });
  }

  try {
    const refs = await countObraReferencias(service, codigo);
    const total = Object.values(refs).reduce((a, b) => a + b, 0);
    if (total > 0) {
      const parts = Object.entries(refs)
        .filter(([, n]) => n > 0)
        .map(([t, n]) => `${t.replace(/_/g, " ")} (${n})`);
      return res.status(409).json({
        error: `Não é possível excluir: o contrato ${codigo} está vinculado a ${parts.join(", ")}.`,
      });
    }

    const { error } = await service.from("obras").delete().eq("codigo", codigo);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true, codigo });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro ao verificar vínculos do contrato.";
    return res.status(500).json({ error: msg });
  }
});

router.get("/ping", requireAuth, async (_req: AuthedRequest, res) => res.json({ ok: true }));

export default router;
