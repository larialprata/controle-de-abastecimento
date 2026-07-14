import { Router } from "express";
import { z } from "zod";
import { createSupabaseServiceRole } from "../lib/supabase";
import { resolveMobilidadeEquipamento } from "../lib/equipamentoMobilidade";
import { normalizeEquipamentoEmpresa } from "../lib/equipamentoEmpresa";
import { parseObraCodigoInput, parseObraReferencia } from "../lib/obraCodigo";
import {
  buildEquipamentoExternoQrUrl,
  expandAtivoSearchNeedles,
  findEquipamentoExterno,
  equipamentosExternosConnectionMode,
  isEquipamentosExternosConfigured,
  normalizeAtivoPlacaExterno,
} from "../lib/equipamentosExternos";
import { lookupEquipamentoFromQr } from "../lib/equipamentoQrLookup";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";
import { assertUserObraAccess, getUserObraCodigos, ObraAccessError } from "../lib/userObras";
import {
  assertCanWriteWebPage,
  loadWebWriteProfile,
  WebWriteAccessError,
  writePageForEquipamentoTipo,
} from "../lib/webWriteAccess";

const router = Router();

function buildTanqueAtivo(obraCodigo: number, tanqueNumero: number): string {
  return `T${obraCodigo}-${tanqueNumero}`;
}

const equipamentoTipoSchema = z.enum(["TANQUE", "MELOSA", "EQUIPAMENTO"]);
const equipamentoMobilidadeSchema = z.enum(["ESTACIONARIO", "MOVEL"]);
const equipamentoEmpresaInputSchema = z.string().trim().max(100).nullable().optional();
const equipamentoPlacaInputSchema = z.string().trim().max(20).nullable().optional();

/** Normaliza placa: maiúsculas, sem espaços (ex.: KVW2O9X). */
function normalizeEquipamentoPlaca(value: string | null | undefined): string | null {
  if (value == null) return null;
  const norm = value.trim().toUpperCase().replace(/[\s\-]/g, "");
  return norm || null;
}

const createEquipamentoSchema = z
  .object({
    ativo: z.string().trim().min(1).max(100).optional(),
    nome: z.string().trim().max(300).optional(),
    tipo: equipamentoTipoSchema,
    obra_codigo: z.number().int().positive().nullable().optional(),
    tanque_numero: z.number().int().positive().optional(),
    capacidade_litros: z.number().positive().nullable().optional(),
    saldo_inicial_litros: z.number().nonnegative().nullable().optional(),
    mobilidade: equipamentoMobilidadeSchema.nullable().optional(),
    empresa: equipamentoEmpresaInputSchema,
    placa: equipamentoPlacaInputSchema,
  })
  .superRefine((data, ctx) => {
    if (data.tipo === "MELOSA" && data.obra_codigo != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Melosa não pode ser vinculada a uma obra.",
        path: ["obra_codigo"],
      });
    }
    if (data.tipo === "TANQUE") {
      if (data.obra_codigo == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Informe a obra do tanque.",
          path: ["obra_codigo"],
        });
      }
      if (data.tanque_numero == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Informe o número do tanque.",
          path: ["tanque_numero"],
        });
      }
      if (!data.nome?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Informe uma descrição para o tanque.",
          path: ["nome"],
        });
      }
      if (data.capacidade_litros == null || data.capacidade_litros <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Informe a capacidade do tanque em litros.",
          path: ["capacidade_litros"],
        });
      }
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
    if (data.tipo !== "TANQUE" && data.saldo_inicial_litros != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Saldo inicial só se aplica a tanques.",
        path: ["saldo_inicial_litros"],
      });
    }
    if (data.tipo !== "EQUIPAMENTO" && data.mobilidade != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Mobilidade só se aplica a equipamentos.",
        path: ["mobilidade"],
      });
    }
    if (data.tipo !== "EQUIPAMENTO" && data.empresa != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Empresa só se aplica a equipamentos.",
        path: ["empresa"],
      });
    }
    if (data.tipo !== "EQUIPAMENTO" && data.placa != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Placa só se aplica a equipamentos.",
        path: ["placa"],
      });
    }
  });

const EQUIPAMENTO_SELECT =
  "ativo, nome, tipo, obra_codigo, tanque_numero, capacidade_litros, saldo_inicial_litros, saldo_inicial_em, mobilidade, empresa, placa";

function formatEquipamentoDbError(message: string): string {
  if (message.includes("invalid input value for enum equipamento_empresa")) {
    return "Banco desatualizado: execute migration_equipamento_empresa_text.sql no SQL Editor do Supabase.";
  }
  if (
    message.includes("equipamentos_placa_unique_idx") ||
    (message.includes("placa") && message.toLowerCase().includes("duplicate"))
  ) {
    return "Já existe um equipamento com essa placa.";
  }
  if (message.includes("column") && message.includes("placa") && message.includes("does not exist")) {
    return "Banco desatualizado: execute migration_equipamento_placa.sql no SQL Editor do Supabase.";
  }
  return message;
}

const EQUIPAMENTOS_QR_PUBLIC_BASE_URL = process.env.EQUIPAMENTOS_QR_PUBLIC_BASE_URL?.trim() || "";

async function resolveEquipamentoQrResponse(input: {
  ativo: string;
  nome?: string | null;
  obra_codigo?: number | null;
  tipo?: "EQUIPAMENTO" | "MELOSA" | "TANQUE";
  /** Cadastrado no Controle Abast — com match no Controle de Equipamentos usa QR externo */
  existsInAbast?: boolean;
}) {
  const ativo = input.ativo.trim();
  const tipo = input.tipo === "MELOSA" ? "MELOSA" : "EQUIPAMENTO";
  const inAbast = input.existsInAbast ?? false;

  const externo = inAbast ? await findEquipamentoExterno(ativo, input.obra_codigo ?? null) : null;
  if (externo) {
    const qrContent = buildEquipamentoExternoQrUrl(externo.qr_token, EQUIPAMENTOS_QR_PUBLIC_BASE_URL);
    return {
      ativo,
      nome: input.nome ?? externo.name,
      obra_codigo: input.obra_codigo ?? null,
      source: "externo" as const,
      qr_content: qrContent,
      externo: {
        id: externo.id,
        ativo_placa: externo.ativo_placa,
        obra_code: externo.obra_code,
        qr_token: externo.qr_token,
        name: externo.name,
        company_name: externo.company_name,
        contract_name: externo.contract_name,
      },
    };
  }

  const qrContent = `CONTROLE_ABAST:${tipo}:${ativo}`;
  return {
    ativo,
    nome: input.nome ?? ativo,
    obra_codigo: input.obra_codigo ?? null,
    source: "abast" as const,
    qr_content: qrContent,
    externo: null,
  };
}

async function loadAbastEquipamentoByAtivo(
  ativoOuPlaca: string,
  obraCodigo?: number | null,
): Promise<{ ativo: string; nome: string | null; empresa: string | null; placa: string | null } | null> {
  const service = createSupabaseServiceRole();
  const norm = normalizeAtivoPlacaExterno(ativoOuPlaca);
  if (!norm) return null;

  const searchNeedles = expandAtivoSearchNeedles(ativoOuPlaca);

  function mapRow(row: {
    ativo: string;
    nome: string | null;
    empresa: string | null;
    placa?: string | null;
  }) {
    return {
      ativo: row.ativo,
      nome: row.nome,
      empresa: row.empresa,
      placa: row.placa?.trim() ? normalizeAtivoPlacaExterno(row.placa) : null,
    };
  }

  function matchesAtivoOrPlaca(row: { ativo: string; placa?: string | null }): boolean {
    if (normalizeAtivoPlacaExterno(row.ativo) === norm) return true;
    if (row.placa && normalizeAtivoPlacaExterno(row.placa) === norm) return true;
    return false;
  }

  async function findInScope(scopeObra?: number | null) {
    for (const needle of searchNeedles) {
      let byAtivo = service
        .from("equipamentos")
        .select("ativo, nome, empresa, placa")
        .eq("tipo", "EQUIPAMENTO")
        .ilike("ativo", needle);
      if (scopeObra != null && scopeObra > 0) {
        byAtivo = byAtivo.eq("obra_codigo", scopeObra);
      }
      const { data: ativoRows, error: ativoErr } = await byAtivo.limit(8);
      if (ativoErr) {
        if (ativoErr.message.includes("placa") && ativoErr.message.includes("does not exist")) {
          throw new Error(
            "Banco desatualizado: execute migration_equipamento_placa.sql no SQL Editor do Supabase.",
          );
        }
        throw ativoErr;
      }
      const ativoMatch = (ativoRows ?? []).find((row) => matchesAtivoOrPlaca(row));
      if (ativoMatch) return mapRow(ativoMatch);

      let byPlaca = service
        .from("equipamentos")
        .select("ativo, nome, empresa, placa")
        .eq("tipo", "EQUIPAMENTO")
        .ilike("placa", needle);
      if (scopeObra != null && scopeObra > 0) {
        byPlaca = byPlaca.eq("obra_codigo", scopeObra);
      }
      const { data: placaRows, error: placaErr } = await byPlaca.limit(8);
      if (placaErr) {
        if (placaErr.message.includes("placa") && placaErr.message.includes("does not exist")) {
          throw new Error(
            "Banco desatualizado: execute migration_equipamento_placa.sql no SQL Editor do Supabase.",
          );
        }
        throw placaErr;
      }
      const placaMatch = (placaRows ?? []).find((row) => matchesAtivoOrPlaca(row));
      if (placaMatch) return mapRow(placaMatch);
    }

    let fallbackQuery = service
      .from("equipamentos")
      .select("ativo, nome, empresa, placa")
      .eq("tipo", "EQUIPAMENTO");
    if (scopeObra != null && scopeObra > 0) {
      fallbackQuery = fallbackQuery.eq("obra_codigo", scopeObra);
    }
    const { data: rows, error: fallbackError } = await fallbackQuery;
    if (fallbackError) {
      if (fallbackError.message.includes("placa") && fallbackError.message.includes("does not exist")) {
        throw new Error(
          "Banco desatualizado: execute migration_equipamento_placa.sql no SQL Editor do Supabase.",
        );
      }
      throw fallbackError;
    }
    const fallbackMatch = (rows ?? []).find((row) => matchesAtivoOrPlaca(row));
    if (!fallbackMatch) return null;
    return mapRow(fallbackMatch);
  }

  if (obraCodigo != null && obraCodigo > 0) {
    const scoped = await findInScope(obraCodigo);
    if (scoped) return scoped;
  }

  return findInScope(null);
}

const lookupQrSchema = z.object({
  qr: z.string().trim().min(1).max(2000),
  obra_codigo: z.number().int().positive().optional().nullable(),
});

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
  if (!req.userId) return res.status(401).json({ error: "Unauthorized" });

  const tipoRaw = typeof req.query.tipo === "string" ? req.query.tipo.toUpperCase() : undefined;
  const obraRaw = typeof req.query.obra_codigo === "string" ? req.query.obra_codigo : undefined;
  const mobilidadeRaw =
    typeof req.query.mobilidade === "string" ? req.query.mobilidade.toUpperCase() : undefined;
  const empresaRaw =
    typeof req.query.empresa === "string" ? normalizeEquipamentoEmpresa(req.query.empresa) : null;

  const service = createSupabaseServiceRole();
  const obraScope = await getUserObraCodigos(service, req.userId);
  let query = service.from("equipamentos").select(EQUIPAMENTO_SELECT);
  if (tipoRaw === "TANQUE") {
    query = query.order("obra_codigo").order("tanque_numero");
  } else {
    query = query.order("ativo");
  }

  if (obraScope && tipoRaw !== "TANQUE" && tipoRaw !== "MELOSA") {
    if (tipoRaw === "EQUIPAMENTO") {
      query = query.in("obra_codigo", obraScope);
    } else {
      query = query.or(`tipo.eq.MELOSA,tipo.eq.TANQUE,obra_codigo.in.(${obraScope.join(",")})`);
    }
  }

  if (tipoRaw === "TANQUE" || tipoRaw === "MELOSA" || tipoRaw === "EQUIPAMENTO") {
    query = query.eq("tipo", tipoRaw);
  }
  const obraCodigoFiltro = obraRaw ? parseObraCodigoInput(obraRaw) : undefined;
  if (obraCodigoFiltro != null) {
    query = query.eq("obra_codigo", obraCodigoFiltro);
  }
  if (mobilidadeRaw === "ESTACIONARIO" || mobilidadeRaw === "MOVEL") {
    query = query.eq("mobilidade", mobilidadeRaw);
  }
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: formatEquipamentoDbError(error.message) });
  let equipamentos = data ?? [];
  if (empresaRaw) {
    const empresaNeedle = empresaRaw.toLowerCase();
    equipamentos = equipamentos.filter((e) =>
      (normalizeEquipamentoEmpresa(e.empresa) ?? "").toLowerCase() === empresaNeedle,
    );
  }
  return res.json({ equipamentos });
});

router.get("/equipamentos/qr/status", requireAuth, async (_req: AuthedRequest, res) => {
  return res.json({
    externo_configurado: isEquipamentosExternosConfigured(),
    conexao: equipamentosExternosConnectionMode(),
    public_base_url: EQUIPAMENTOS_QR_PUBLIC_BASE_URL || null,
  });
});

router.post("/equipamentos/qr/lookup", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = lookupQrSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  try {
    const equipamento = await lookupEquipamentoFromQr(
      parsed.data.qr,
      parsed.data.obra_codigo ?? null,
      loadAbastEquipamentoByAtivo,
    );
    if (!equipamento) {
      return res.status(404).json({ error: "QR code não reconhecido ou equipamento não encontrado." });
    }
    return res.json({ equipamento });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: message });
  }
});

const resolveQrBatchSchema = z.object({
  itens: z
    .array(
      z.object({
        ativo: z.string().trim().min(1).max(100),
        nome: z.string().trim().max(300).optional(),
        obra_codigo: z.number().int().positive().nullable().optional(),
        tipo: equipamentoTipoSchema.optional(),
      }),
    )
    .min(1)
    .max(500),
});

router.post("/equipamentos/qr/resolve", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = resolveQrBatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  const results = await Promise.all(
    parsed.data.itens.map((item) =>
      resolveEquipamentoQrResponse({
        ativo: item.ativo,
        nome: item.nome,
        obra_codigo: item.obra_codigo ?? null,
        tipo: item.tipo,
        existsInAbast: true,
      }),
    ),
  );

  return res.json({ itens: results });
});

router.get("/equipamentos/:ativo/qr", requireAuth, async (req: AuthedRequest, res) => {
  const ativo = decodeURIComponent(req.params.ativo ?? "").trim();
  if (!ativo) return res.status(400).json({ error: "Ativo inválido." });

  const obraRaw = typeof req.query.obra_codigo === "string" ? req.query.obra_codigo : undefined;
  const obra_codigo = obraRaw ? parseObraCodigoInput(obraRaw) : null;

  const service = createSupabaseServiceRole();
  const { data: existing } = await service
    .from("equipamentos")
    .select("ativo, nome, tipo, obra_codigo")
    .eq("ativo", ativo)
    .maybeSingle();

  const qr = await resolveEquipamentoQrResponse({
    ativo,
    nome: existing?.nome ?? ativo,
    obra_codigo: obra_codigo ?? existing?.obra_codigo ?? null,
    tipo: existing?.tipo === "MELOSA" ? "MELOSA" : "EQUIPAMENTO",
    existsInAbast: Boolean(existing),
  });

  return res.json({ qr });
});

router.post("/equipamentos", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = createEquipamentoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }

  const {
    tipo,
    obra_codigo,
    capacidade_litros,
    saldo_inicial_litros,
    mobilidade,
    empresa,
    placa,
    tanque_numero,
  } = parsed.data;
  const service = createSupabaseServiceRole();

  try {
    const profile = await loadWebWriteProfile(service, req.userId!);
    assertCanWriteWebPage(profile, writePageForEquipamentoTipo(tipo));
  } catch (e) {
    if (e instanceof WebWriteAccessError) return res.status(e.status).json({ error: e.message });
    throw e;
  }

  const obraCodigoNormalizado =
    tipo === "MELOSA" ? null : parseObraCodigoInput(obra_codigo ?? null);

  const obraErr = await validateObraCodigo(service, obraCodigoNormalizado);
  if (obraErr) return res.status(400).json({ error: obraErr });

  let ativo = parsed.data.ativo?.trim() ?? "";
  let tanqueNumeroFinal: number | null = null;
  if (tipo === "TANQUE") {
    if (obraCodigoNormalizado == null || tanque_numero == null) {
      return res.status(400).json({ error: "Obra e número do tanque são obrigatórios." });
    }
    tanqueNumeroFinal = tanque_numero;
    if (!ativo) ativo = buildTanqueAtivo(obraCodigoNormalizado, tanqueNumeroFinal);
  } else if (!ativo) {
    return res.status(400).json({ error: "Ativo é obrigatório." });
  }

  const nome = parsed.data.nome?.trim() || ativo;

  if (tipo === "MELOSA" && capacidade_litros != null && capacidade_litros <= 0) {
    return res.status(400).json({ error: "Capacidade da melosa deve ser maior que zero." });
  }
  if (tipo === "TANQUE" && capacidade_litros != null && capacidade_litros <= 0) {
    return res.status(400).json({ error: "Capacidade do tanque deve ser maior que zero." });
  }
  if (tipo === "TANQUE" && saldo_inicial_litros != null && saldo_inicial_litros < 0) {
    return res.status(400).json({ error: "Quantidade no tanque não pode ser negativa." });
  }

  if (obraCodigoNormalizado != null && req.userId) {
    try {
      await assertUserObraAccess(service, req.userId, obraCodigoNormalizado);
    } catch (e) {
      if (e instanceof ObraAccessError) return res.status(e.status).json({ error: e.message });
      throw e;
    }
  }

  const { data: existing } = await service
    .from("equipamentos")
    .select("ativo")
    .ilike("ativo", ativo)
    .maybeSingle();
  if (existing) {
    return res.status(409).json({ error: `Já existe um equipamento com o ativo ${existing.ativo}.` });
  }

  if (tipo === "TANQUE" && obraCodigoNormalizado != null && tanqueNumeroFinal != null) {
    const { data: tanqueDup } = await service
      .from("equipamentos")
      .select("ativo")
      .eq("tipo", "TANQUE")
      .eq("obra_codigo", obraCodigoNormalizado)
      .eq("tanque_numero", tanqueNumeroFinal)
      .maybeSingle();
    if (tanqueDup) {
      return res.status(409).json({
        error: `Já existe o tanque ${tanqueNumeroFinal} na obra ${obraCodigoNormalizado}.`,
      });
    }
  }

  const { data, error } = await service
    .from("equipamentos")
    .insert({
      ativo,
      nome,
      tipo,
      obra_codigo: obraCodigoNormalizado,
      tanque_numero: tipo === "TANQUE" ? tanqueNumeroFinal : null,
      capacidade_litros:
        tipo === "MELOSA" || tipo === "TANQUE" ? (capacidade_litros ?? null) : null,
      saldo_inicial_litros: tipo === "TANQUE" ? (saldo_inicial_litros ?? null) : null,
      saldo_inicial_em:
        tipo === "TANQUE" && saldo_inicial_litros != null ? new Date().toISOString() : null,
      mobilidade:
        tipo === "EQUIPAMENTO" ? resolveMobilidadeEquipamento(nome, mobilidade) : null,
      empresa: tipo === "EQUIPAMENTO" ? normalizeEquipamentoEmpresa(empresa) : null,
      placa: tipo === "EQUIPAMENTO" ? normalizeEquipamentoPlaca(placa) : null,
    })
    .select(EQUIPAMENTO_SELECT)
    .single();
  if (error) {
    const formatted = formatEquipamentoDbError(error.message);
    const status = formatted.includes("Já existe um equipamento com essa placa") ? 409 : 500;
    return res.status(status).json({ error: formatted });
  }
  return res.status(201).json({ equipamento: data });
});

const importItemSchema = z.object({
  linha: z.number().int().positive().optional(),
  ativo: z.string().trim().min(1).max(100),
  nome: z.string().trim().max(300).optional(),
  obra_codigo: z.number().int().positive().nullable().optional(),
  obra_nome: z.string().trim().max(300).optional(),
  mobilidade: equipamentoMobilidadeSchema.nullable().optional(),
  empresa: equipamentoEmpresaInputSchema.optional(),
  placa: equipamentoPlacaInputSchema,
});

const importEquipamentosSchema = z.object({
  modo: z.enum(["criar", "upsert"]).default("upsert"),
  itens: z.array(importItemSchema).min(1).max(1000),
});

router.post("/equipamentos/import", requireAuth, async (req: AuthedRequest, res) => {
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

  try {
    const profile = await loadWebWriteProfile(service, req.userId!);
    assertCanWriteWebPage(profile, "equipamentos");
  } catch (e) {
    if (e instanceof WebWriteAccessError) return res.status(e.status).json({ error: e.message });
    throw e;
  }

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

    let obra_codigo: number | null =
      item.obra_codigo != null ? parseObraCodigoInput(item.obra_codigo) : null;
    if (obra_codigo == null && item.obra_nome?.trim()) {
      const fromNome = parseObraReferencia(item.obra_nome);
      if (fromNome.obra_codigo != null) {
        obra_codigo = fromNome.obra_codigo;
      } else {
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
    }

    if (obra_codigo != null) {
      const obraErr = await validateObraCodigo(service, obra_codigo);
      if (obraErr) {
        erros.push({ linha, ativo, mensagem: obraErr });
        continue;
      }
      if (req.userId) {
        try {
          await assertUserObraAccess(service, req.userId, obra_codigo);
        } catch (e) {
          erros.push({
            linha,
            ativo,
            mensagem: e instanceof ObraAccessError ? e.message : "Sem permissão para a obra.",
          });
          continue;
        }
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
      empresa: normalizeEquipamentoEmpresa(item.empresa),
      placa: normalizeEquipamentoPlaca(item.placa),
    };

    if (existing) {
      const { error } = await service.from("equipamentos").update(payload).eq("ativo", existing.ativo);
      if (error) {
        erros.push({ linha, ativo, mensagem: formatEquipamentoDbError(error.message) });
        continue;
      }
      atualizados += 1;
    } else {
      const { error } = await service.from("equipamentos").insert(payload);
      if (error) {
        erros.push({ linha, ativo, mensagem: formatEquipamentoDbError(error.message) });
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
    tanque_numero: z.number().int().positive().optional(),
    capacidade_litros: z.number().positive().nullable().optional(),
    saldo_inicial_litros: z.number().nonnegative().nullable().optional(),
    mobilidade: equipamentoMobilidadeSchema.nullable().optional(),
    empresa: equipamentoEmpresaInputSchema,
    placa: equipamentoPlacaInputSchema,
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
    if (data.tipo != null && data.tipo !== "EQUIPAMENTO" && data.empresa != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Empresa só se aplica a equipamentos.",
        path: ["empresa"],
      });
    }
    if (data.tipo != null && data.tipo !== "EQUIPAMENTO" && data.placa != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Placa só se aplica a equipamentos.",
        path: ["placa"],
      });
    }
    if (data.tipo != null && data.tipo !== "TANQUE" && data.saldo_inicial_litros != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Saldo inicial só se aplica a tanques.",
        path: ["saldo_inicial_litros"],
      });
    }
  });

router.patch("/equipamentos/:ativo", requireAuth, async (req: AuthedRequest, res) => {
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
    .select("ativo, nome, tipo, obra_codigo, tanque_numero, capacidade_litros, mobilidade, empresa, placa")
    .eq("ativo", ativoAtual)
    .maybeSingle();
  if (findErr) return res.status(500).json({ error: findErr.message });
  if (!existing) {
    return res.status(404).json({ error: `Equipamento ${ativoAtual} não encontrado.` });
  }

  try {
    const profile = await loadWebWriteProfile(service, req.userId!);
    assertCanWriteWebPage(profile, writePageForEquipamentoTipo(existing.tipo));
  } catch (e) {
    if (e instanceof WebWriteAccessError) return res.status(e.status).json({ error: e.message });
    throw e;
  }

  const tipo = parsed.data.tipo ?? existing.tipo;
  const ativoNovo = parsed.data.ativo?.trim() ?? existing.ativo;
  const nomeRaw = parsed.data.nome !== undefined ? parsed.data.nome.trim() : (existing.nome ?? "");
  const nome = nomeRaw || ativoNovo;

  if (tipo === "TANQUE" && !nomeRaw) {
    return res.status(400).json({ error: "Informe uma descrição para o tanque." });
  }
  if (
    tipo === "TANQUE" &&
    parsed.data.saldo_inicial_litros != null &&
    parsed.data.saldo_inicial_litros < 0
  ) {
    return res.status(400).json({ error: "Quantidade no tanque não pode ser negativa." });
  }

  let obra_codigo: number | null;
  if (tipo === "MELOSA") {
    obra_codigo = null;
  } else if (parsed.data.obra_codigo !== undefined) {
    obra_codigo = parseObraCodigoInput(parsed.data.obra_codigo);
  } else {
    obra_codigo = existing.obra_codigo;
  }

  const obraErr = await validateObraCodigo(service, tipo === "MELOSA" ? null : obra_codigo);
  if (obraErr) return res.status(400).json({ error: obraErr });

  if (req.userId) {
    try {
      if (existing.obra_codigo != null) {
        await assertUserObraAccess(service, req.userId, existing.obra_codigo);
      }
      if (obra_codigo != null && obra_codigo !== existing.obra_codigo) {
        await assertUserObraAccess(service, req.userId, obra_codigo);
      }
    } catch (e) {
      if (e instanceof ObraAccessError) return res.status(e.status).json({ error: e.message });
      throw e;
    }
  }

  let mobilidade: string | null;
  if (tipo !== "EQUIPAMENTO") {
    mobilidade = null;
  } else if (parsed.data.mobilidade !== undefined) {
    mobilidade = resolveMobilidadeEquipamento(nome, parsed.data.mobilidade);
  } else {
    mobilidade = resolveMobilidadeEquipamento(nome, existing.mobilidade ?? null);
  }

  let empresa: string | null;
  if (tipo !== "EQUIPAMENTO") {
    empresa = null;
  } else if (parsed.data.empresa !== undefined) {
    empresa = normalizeEquipamentoEmpresa(parsed.data.empresa);
  } else {
    empresa = normalizeEquipamentoEmpresa(existing.empresa);
  }

  let placa: string | null;
  if (tipo !== "EQUIPAMENTO") {
    placa = null;
  } else if (parsed.data.placa !== undefined) {
    placa = normalizeEquipamentoPlaca(parsed.data.placa);
  } else {
    placa = normalizeEquipamentoPlaca(existing.placa);
  }

  let tanqueNumeroAtualizado: number | null = null;
  let ativoFinal = ativoNovo;
  if (tipo === "TANQUE") {
    tanqueNumeroAtualizado =
      parsed.data.tanque_numero ?? (existing.tanque_numero as number | null | undefined) ?? null;
    if (obra_codigo == null || tanqueNumeroAtualizado == null) {
      return res.status(400).json({ error: "Obra e número do tanque são obrigatórios." });
    }
    ativoFinal = buildTanqueAtivo(obra_codigo, tanqueNumeroAtualizado);
    const { data: tanqueDup } = await service
      .from("equipamentos")
      .select("ativo")
      .eq("tipo", "TANQUE")
      .eq("obra_codigo", obra_codigo)
      .eq("tanque_numero", tanqueNumeroAtualizado)
      .neq("ativo", ativoAtual)
      .maybeSingle();
    if (tanqueDup) {
      return res.status(409).json({
        error: `Já existe o tanque ${tanqueNumeroAtualizado} na obra ${obra_codigo}.`,
      });
    }
  }

  if (ativoFinal.toLowerCase() !== ativoAtual.toLowerCase()) {
    const { data: duplicate } = await service
      .from("equipamentos")
      .select("ativo")
      .ilike("ativo", ativoFinal)
      .maybeSingle();
    if (duplicate) {
      return res.status(409).json({ error: `Já existe um equipamento com o ativo ${duplicate.ativo}.` });
    }
  }

  const { data, error } = await service
    .from("equipamentos")
    .update({
      ativo: ativoFinal,
      nome,
      tipo,
      obra_codigo,
      tanque_numero: tipo === "TANQUE" ? tanqueNumeroAtualizado : null,
      mobilidade,
      empresa,
      placa,
      ...(parsed.data.capacidade_litros !== undefined
        ? {
            capacidade_litros:
              tipo === "MELOSA" || tipo === "TANQUE" ? parsed.data.capacidade_litros : null,
          }
        : {}),
      ...(parsed.data.saldo_inicial_litros !== undefined
        ? {
            saldo_inicial_litros: tipo === "TANQUE" ? parsed.data.saldo_inicial_litros : null,
            saldo_inicial_em:
              tipo === "TANQUE" && parsed.data.saldo_inicial_litros != null
                ? new Date().toISOString()
                : null,
          }
        : {}),
    })
    .eq("ativo", ativoAtual)
    .select(EQUIPAMENTO_SELECT)
    .single();
  if (error) {
    const formatted = formatEquipamentoDbError(error.message);
    const status = formatted.includes("Já existe um equipamento com essa placa") ? 409 : 500;
    return res.status(status).json({ error: formatted });
  }
  return res.json({ equipamento: data });
});

router.delete("/equipamentos/:ativo", requireAuth, async (req: AuthedRequest, res) => {
  const ativo = decodeURIComponent(req.params.ativo ?? "").trim();
  if (!ativo) {
    return res.status(400).json({ error: "Ativo inválido." });
  }

  const service = createSupabaseServiceRole();
  const { data: existing, error: findErr } = await service
    .from("equipamentos")
    .select("ativo, tipo, obra_codigo")
    .eq("ativo", ativo)
    .maybeSingle();
  if (findErr) return res.status(500).json({ error: findErr.message });
  if (!existing) {
    return res.status(404).json({ error: `Equipamento ${ativo} não encontrado.` });
  }

  try {
    const profile = await loadWebWriteProfile(service, req.userId!);
    assertCanWriteWebPage(profile, writePageForEquipamentoTipo(existing.tipo));
    if (existing.obra_codigo != null && req.userId) {
      await assertUserObraAccess(service, req.userId, existing.obra_codigo);
    }
  } catch (e) {
    if (e instanceof WebWriteAccessError || e instanceof ObraAccessError) {
      return res.status(e.status).json({ error: e.message });
    }
    throw e;
  }

  const { error } = await service.from("equipamentos").delete().eq("ativo", ativo);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
});

export default router;
