import { Router } from "express";
import { z } from "zod";
import { createSupabaseServiceRole } from "../lib/supabase";
import { resolveMobilidadeEquipamento } from "../lib/equipamentoMobilidade";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";
import { requireAdmin } from "../middleware/requireAdmin";

const router = Router();

const equipamentoTipoSchema = z.enum(["TANQUE", "MELOSA", "EQUIPAMENTO"]);
const equipamentoMobilidadeSchema = z.enum(["ESTACIONARIO", "MOVEL"]);

const createEquipamentoSchema = z
  .object({
    ativo: z.string().trim().min(1).max(100),
    nome: z.string().trim().max(300).optional(),
    tipo: equipamentoTipoSchema,
    obra_codigo: z.number().int().positive().nullable().optional(),
    capacidade_litros: z.number().positive().nullable().optional(),
    mobilidade: equipamentoMobilidadeSchema.nullable().optional(),
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
    if (data.tipo === "EQUIPAMENTO" && data.capacidade_litros != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Equipamento não utiliza capacidade em litros.",
        path: ["capacidade_litros"],
      });
    }
    if (data.tipo !== "EQUIPAMENTO" && data.mobilidade != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Mobilidade só se aplica a equipamentos.",
        path: ["mobilidade"],
      });
    }
  });

const EQUIPAMENTO_SELECT = "ativo, nome, tipo, obra_codigo, capacidade_litros, mobilidade";

async function validateObraCodigo(
  service: ReturnType<typeof createSupabaseServiceRole>,
  obra_codigo: number | null | undefined,
): Promise<string | null> {
  if (obra_codigo == null) return null;
  const { data: obra, error: obraErr } = await service
    .from("obras")
    .select("codigo")
    .eq("codigo", obra_codigo)
    .maybeSingle();
  if (obraErr) return obraErr.message;
  if (!obra) return "Obra não encontrada.";
  return null;
}

router.get("/equipamentos", requireAuth, async (req: AuthedRequest, res) => {
  const tipoRaw = typeof req.query.tipo === "string" ? req.query.tipo.toUpperCase() : undefined;
  const obraRaw = typeof req.query.obra_codigo === "string" ? Number(req.query.obra_codigo) : undefined;
  const mobilidadeRaw =
    typeof req.query.mobilidade === "string" ? req.query.mobilidade.toUpperCase() : undefined;

  const service = createSupabaseServiceRole();
  let query = service.from("equipamentos").select(EQUIPAMENTO_SELECT).order("ativo");

  if (tipoRaw === "TANQUE" || tipoRaw === "MELOSA" || tipoRaw === "EQUIPAMENTO") {
    query = query.eq("tipo", tipoRaw);
  }
  if (obraRaw != null && Number.isFinite(obraRaw)) {
    query = query.eq("obra_codigo", obraRaw);
  }
  if (mobilidadeRaw === "ESTACIONARIO" || mobilidadeRaw === "MOVEL") {
    query = query.eq("mobilidade", mobilidadeRaw);
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

  const { ativo, tipo, obra_codigo, capacidade_litros, mobilidade } = parsed.data;
  const nome = parsed.data.nome?.trim() || ativo;
  const service = createSupabaseServiceRole();

  if (tipo === "MELOSA" && capacidade_litros != null && capacidade_litros <= 0) {
    return res.status(400).json({ error: "Capacidade da melosa deve ser maior que zero." });
  }

  const obraErr = await validateObraCodigo(
    service,
    tipo === "MELOSA" ? null : (obra_codigo ?? null),
  );
  if (obraErr) return res.status(400).json({ error: obraErr });

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
      obra_codigo: tipo === "MELOSA" ? null : (obra_codigo ?? null),
      capacidade_litros: tipo === "MELOSA" ? (capacidade_litros ?? null) : null,
      mobilidade:
        tipo === "EQUIPAMENTO" ? resolveMobilidadeEquipamento(nome, mobilidade) : null,
    })
    .select(EQUIPAMENTO_SELECT)
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json({ equipamento: data });
});

const importItemSchema = z.object({
  linha: z.number().int().positive().optional(),
  ativo: z.string().trim().min(1).max(100),
  nome: z.string().trim().max(300).optional(),
  obra_codigo: z.number().int().positive().nullable().optional(),
  obra_nome: z.string().trim().max(300).optional(),
  mobilidade: equipamentoMobilidadeSchema.nullable().optional(),
});

const importEquipamentosSchema = z.object({
  modo: z.enum(["criar", "upsert"]).default("upsert"),
  itens: z.array(importItemSchema).min(1).max(1000),
});

router.post("/equipamentos/import", requireAdmin, async (req: AuthedRequest, res) => {
  const parsed = importEquipamentosSchema.safeParse(req.body);
  if (!parsed.success) {
    const fields = parsed.error.flatten().fieldErrors;
    return res.status(400).json({
      error: `Dados de importação inválidos: ${JSON.stringify(fields)}`,
      details: fields,
    });
  }

  const { modo, itens } = parsed.data;
  const service = createSupabaseServiceRole();

  const { data: obras, error: obrasErr } = await service.from("obras").select("codigo, nome");
  if (obrasErr) return res.status(500).json({ error: obrasErr.message });

  const obrasPorNome = new Map(
    (obras ?? []).map((o) => [o.nome.trim().toLowerCase(), o.codigo] as const),
  );

  let criados = 0;
  let atualizados = 0;
  let ignorados = 0;
  const erros: { linha?: number; ativo: string; mensagem: string }[] = [];

  for (const item of itens) {
    const linha = item.linha;
    const ativo = item.ativo.trim();
    const nome = item.nome?.trim() || ativo;

    let obra_codigo: number | null = item.obra_codigo ?? null;
    if (obra_codigo == null && item.obra_nome?.trim()) {
      const key = item.obra_nome.trim().toLowerCase();
      const cod = obrasPorNome.get(key);
      if (cod == null) {
        erros.push({
          linha,
          ativo,
          mensagem: `Obra "${item.obra_nome}" não encontrada.`,
        });
        continue;
      }
      obra_codigo = cod;
    }

    if (obra_codigo != null) {
      const obraErr = await validateObraCodigo(service, obra_codigo);
      if (obraErr) {
        erros.push({ linha, ativo, mensagem: obraErr });
        continue;
      }
    }

    const { data: existing } = await service
      .from("equipamentos")
      .select("ativo, tipo")
      .ilike("ativo", ativo)
      .maybeSingle();

    if (existing && modo === "criar") {
      ignorados += 1;
      erros.push({ linha, ativo, mensagem: "Ativo já existe (modo criar)." });
      continue;
    }

    if (existing && existing.tipo !== "EQUIPAMENTO") {
      erros.push({
        linha,
        ativo,
        mensagem: `O ativo já existe como ${existing.tipo}, não como equipamento.`,
      });
      continue;
    }

    const payload = {
      ativo,
      nome,
      tipo: "EQUIPAMENTO" as const,
      obra_codigo,
      capacidade_litros: null,
      mobilidade: resolveMobilidadeEquipamento(nome, item.mobilidade),
    };

    if (existing) {
      const { error } = await service.from("equipamentos").update(payload).eq("ativo", existing.ativo);
      if (error) {
        erros.push({ linha, ativo, mensagem: error.message });
        continue;
      }
      atualizados += 1;
    } else {
      const { error } = await service.from("equipamentos").insert(payload);
      if (error) {
        erros.push({ linha, ativo, mensagem: error.message });
        continue;
      }
      criados += 1;
    }
  }

  return res.json({ criados, atualizados, ignorados, erros, total: itens.length });
});

const updateEquipamentoSchema = z
  .object({
    ativo: z.string().trim().min(1).max(100).optional(),
    nome: z.string().trim().max(300).optional(),
    tipo: equipamentoTipoSchema.optional(),
    obra_codigo: z.number().int().positive().nullable().optional(),
    capacidade_litros: z.number().positive().nullable().optional(),
    mobilidade: equipamentoMobilidadeSchema.nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.tipo === "MELOSA" && data.obra_codigo != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Melosa não pode ser vinculada a uma obra.",
        path: ["obra_codigo"],
      });
    }
    if (data.tipo != null && data.tipo !== "EQUIPAMENTO" && data.mobilidade != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Mobilidade só se aplica a equipamentos.",
        path: ["mobilidade"],
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
    .select("ativo, nome, tipo, obra_codigo, mobilidade")
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

  const obraErr = await validateObraCodigo(service, tipo === "MELOSA" ? null : obra_codigo);
  if (obraErr) return res.status(400).json({ error: obraErr });

  let mobilidade: string | null;
  if (tipo !== "EQUIPAMENTO") {
    mobilidade = null;
  } else if (parsed.data.mobilidade !== undefined) {
    mobilidade = resolveMobilidadeEquipamento(nome, parsed.data.mobilidade);
  } else {
    mobilidade = resolveMobilidadeEquipamento(nome, existing.mobilidade ?? null);
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
      mobilidade,
      ...(parsed.data.capacidade_litros !== undefined
        ? { capacidade_litros: tipo === "MELOSA" ? parsed.data.capacidade_litros : null }
        : {}),
    })
    .eq("ativo", ativoAtual)
    .select(EQUIPAMENTO_SELECT)
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
