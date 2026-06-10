import { Router } from "express";
import { z } from "zod";
import { createSupabaseServiceRole } from "../lib/supabase";
import { envValidated } from "../config";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";

const router = Router();

async function storageObjectExists(
  service: ReturnType<typeof createSupabaseServiceRole>,
  bucket: string,
  storagePath: string
): Promise<boolean> {
  const path = storagePath.trim().replace(/^\/+/, "");
  if (!path) return false;

  const { data, error } = await service.storage.from(bucket).exists(path);
  if (error) {
    console.warn("[storage.exists]", bucket, path, error.message);
  }
  if (data === true) return true;

  const slash = path.lastIndexOf("/");
  const folder = slash >= 0 ? path.slice(0, slash) : "";
  const fileName = slash >= 0 ? path.slice(slash + 1) : path;
  const { data: listed, error: listError } = await service.storage.from(bucket).list(folder, {
    limit: 200,
    search: fileName,
  });
  if (listError) {
    console.warn("[storage.list]", bucket, folder, listError.message);
    return false;
  }
  return listed?.some((f) => f.name === fileName) ?? false;
}

function parseMedidorMelosaNumero(value: string | null | undefined): number | null {
  const raw = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Retirada do tanque: medidor acumulado sobe — litros = final − inicial. */
function litrosRetiradaTanqueFromMedidores(
  inicial: string | null | undefined,
  final: string | null | undefined,
): number | null {
  const ini = parseMedidorMelosaNumero(inicial);
  const fin = parseMedidorMelosaNumero(final);
  if (ini == null || fin == null || fin <= ini) return null;
  const diff = fin - ini;
  return Number.isFinite(diff) && diff > 0 ? diff : null;
}

const tanqueNumeroSchema = z.union([z.literal(1), z.literal(2)]);

const movimentoSchema = z.object({
  operation_id: z.string().uuid(),
  tipo: z.enum(["ENTRADA_TANQUE_OBRA", "RETIRADA_TANQUE", "RETIRADA_MELOSA"]),
  obra_codigo: z.number().int(),
  data_hora: z.string().datetime().optional(),
  litros: z.number().refine((n) => n >= 0),

  tanque_texto: z.string().optional().nullable(),

  combustivel_tipo: z.string().optional().nullable(),
  nota_numero: z.string().optional().nullable(),
  placa_caminhao: z.string().optional().nullable(),
  valor_unitario: z.number().min(0).optional().nullable(),
  nota_storage_path: z.string().optional().nullable(),
  lacre_tanque_numero: z.string().optional().nullable(),
  lacre_tanque_storage_path: z.string().optional().nullable(),
  lacre_melosa_numero: z.string().optional().nullable(),
  lacre_melosa_storage_path: z.string().optional().nullable(),
  medidor_tanque_numero_inicial: z.string().optional().nullable(),
  medidor_tanque_foto_inicial_storage_path: z.string().optional().nullable(),
  medidor_tanque_numero_final: z.string().optional().nullable(),
  medidor_tanque_foto_final_storage_path: z.string().optional().nullable(),
  confirmacao_abastecimento_foto_storage_path: z.string().optional().nullable(),

  melosa_km_registro: z.number().min(0).optional().nullable(),
  melosa_litros_registro: z.number().min(0).optional().nullable(),
  melosa_combustivel_tipo_registro: z.string().optional().nullable(),
  melosa_comprovante_storage_path: z.string().optional().nullable(),
  melosa_medidor_acumulado_inicial_numero: z.string().optional().nullable(),
  melosa_medidor_acumulado_inicial_storage_path: z.string().optional().nullable(),
  melosa_lacre_numero: z.string().optional().nullable(),
  melosa_lacre_storage_path: z.string().optional().nullable(),
  melosa_medidor_acumulado_final_numero: z.string().optional().nullable(),
  melosa_medidor_acumulado_final_storage_path: z.string().optional().nullable(),
  melosa_horimetro_equipamento_abastecido_numero: z.string().optional().nullable(),
  melosa_horimetro_equipamento_abastecido_storage_path: z.string().optional().nullable(),
  melosa_motorista_equipamento_abastecido: z.string().optional().nullable(),
  melosa_equipamento_operador_storage_path: z.string().optional().nullable(),
  melosa_categoria: z.enum(["ESTACIONARIA", "MOVEL"]).optional().nullable(),

  melosa_km_retirada: z.number().min(0).optional().nullable(),
  melosa_combustivel_tipo_retirada: z.string().optional().nullable(),
  melosa_tanque_storage_path: z.string().optional().nullable(),

  /** Ativo melosa / equipamento (app envia placa_texto e fornecedor_texto; DB melosa usa ativo_*). */
  placa_texto: z.string().optional().nullable(),
  fornecedor_texto: z.string().optional().nullable(),
  ativo_melosa_texto: z.string().optional().nullable(),
  ativo_equipamento_texto: z.string().optional().nullable(),
  tanque_numero: tanqueNumeroSchema.optional().nullable(),
  local_latitude: z.number().optional().nullable(),
  local_longitude: z.number().optional().nullable(),
  local_address: z.string().optional().nullable(),

  obs: z.string().optional().nullable(),
});

const melosaUpdateSchema = z
  .object({
    litros: z.number().min(0).optional(),
    melosa_km_registro: z.number().min(0).optional().nullable(),
    melosa_km_retirada: z.number().min(0).optional().nullable(),
    melosa_combustivel_tipo_registro: z.string().optional().nullable(),
    melosa_combustivel_tipo_retirada: z.string().optional().nullable(),
    melosa_medidor_acumulado_inicial_numero: z.string().optional().nullable(),
    melosa_medidor_acumulado_inicial_storage_path: z.string().optional().nullable(),
    ativo_melosa_texto: z.string().optional().nullable(),
    ativo_equipamento_texto: z.string().optional().nullable(),
    placa_texto: z.string().optional().nullable(),
    fornecedor_texto: z.string().optional().nullable(),
    tanque_numero: tanqueNumeroSchema.optional().nullable(),
    lacre_tanque_numero: z.string().optional().nullable(),
    lacre_tanque_storage_path: z.string().optional().nullable(),
    lacre_melosa_numero: z.string().optional().nullable(),
    lacre_melosa_storage_path: z.string().optional().nullable(),
    medidor_tanque_numero_inicial: z.string().optional().nullable(),
    medidor_tanque_foto_inicial_storage_path: z.string().optional().nullable(),
    medidor_tanque_numero_final: z.string().optional().nullable(),
    medidor_tanque_foto_final_storage_path: z.string().optional().nullable(),
    confirmacao_abastecimento_foto_storage_path: z.string().optional().nullable(),
    obs: z.string().optional().nullable(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "Informe ao menos um campo para editar",
  });

const tanqueUpdateSchema = z
  .object({
    litros: z.number().min(0).optional(),
    combustivel_tipo: z.string().optional().nullable(),
    nota_numero: z.string().optional().nullable(),
    valor_unitario: z.number().min(0).optional().nullable(),
    placa_texto: z.string().optional().nullable(),
    placa_caminhao: z.string().optional().nullable(),
    fornecedor_texto: z.string().optional().nullable(),
    tanque_numero: tanqueNumeroSchema.optional().nullable(),
    obs: z.string().optional().nullable(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "Informe ao menos um campo para editar",
  });

const MELOSA_DB_COLUMN_KEYS = [
  "operation_id",
  "usuario_id",
  "tipo",
  "obra_codigo",
  "data_hora",
  "litros",
  "melosa_km_registro",
  "melosa_litros_registro",
  "melosa_combustivel_tipo_registro",
  "melosa_comprovante_storage_path",
  "melosa_medidor_acumulado_inicial_numero",
  "melosa_medidor_acumulado_inicial_storage_path",
  "melosa_lacre_numero",
  "melosa_lacre_storage_path",
  "melosa_medidor_acumulado_final_numero",
  "melosa_medidor_acumulado_final_storage_path",
  "melosa_horimetro_equipamento_abastecido_numero",
  "melosa_horimetro_equipamento_abastecido_storage_path",
  "melosa_motorista_equipamento_abastecido",
  "melosa_equipamento_operador_storage_path",
  "melosa_categoria",
  "melosa_km_retirada",
  "melosa_combustivel_tipo_retirada",
  "melosa_tanque_storage_path",
  "ativo_melosa_texto",
  "ativo_equipamento_texto",
  "tanque_numero",
  "local_latitude",
  "local_longitude",
  "local_address",
  "obs",
] as const;

function mapMelosaAtivoFields<T extends Record<string, unknown>>(row: T): T {
  const out = { ...row } as T & {
    ativo_melosa_texto?: string | null;
    ativo_equipamento_texto?: string | null;
    placa_texto?: string | null;
    fornecedor_texto?: string | null;
  };
  const ativoMelosa =
    typeof out.ativo_melosa_texto === "string" && out.ativo_melosa_texto.trim()
      ? out.ativo_melosa_texto.trim()
      : typeof out.placa_texto === "string" && out.placa_texto.trim()
        ? out.placa_texto.trim()
        : null;
  const ativoEquipamento =
    typeof out.ativo_equipamento_texto === "string" && out.ativo_equipamento_texto.trim()
      ? out.ativo_equipamento_texto.trim()
      : typeof out.fornecedor_texto === "string" && out.fornecedor_texto.trim()
        ? out.fornecedor_texto.trim()
        : null;
  delete out.placa_texto;
  delete out.fornecedor_texto;
  if (ativoMelosa != null) out.ativo_melosa_texto = ativoMelosa;
  if (ativoEquipamento != null) out.ativo_equipamento_texto = ativoEquipamento;
  return out as T;
}

/** Garante que só colunas válidas de melosa_movimentacoes vão ao Supabase (sem placa_texto legado). */
function sanitizeMelosaRowForDb(row: Record<string, unknown>): Record<string, unknown> {
  const mapped = mapMelosaAtivoFields(row);
  const out: Record<string, unknown> = {};
  for (const key of MELOSA_DB_COLUMN_KEYS) {
    if (Object.prototype.hasOwnProperty.call(mapped, key)) {
      out[key] = mapped[key];
    }
  }
  return out;
}

async function isAdmin(service: ReturnType<typeof createSupabaseServiceRole>, userId: string) {
  const { data, error } = await service.from("profiles").select("role").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data?.role === "admin";
}

async function isMelosaDriver(service: ReturnType<typeof createSupabaseServiceRole>, userId: string) {
  const { data, error } = await service.from("profiles").select("is_melosa").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data?.is_melosa === true;
}

router.get("/movimentacoes", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });
    const service = createSupabaseServiceRole();

    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const fetchCount = Math.max(offset + limit, 1);

    const admin = await isAdmin(service, req.userId);

    const origemParam = String(req.query.origem ?? "all").toLowerCase();
    const isTanque = origemParam === "tanque";
    const isMelosa = origemParam === "melosa";
    const isAll = !origemParam || origemParam === "all" || (!isTanque && !isMelosa);
    const wantTanque = isAll || isTanque;
    const wantMelosa = isAll || isMelosa;

    let movs: any[] = [];
    let melosas: any[] = [];

    if (wantTanque) {
      const movimentacoesQuery = service
        .from("movimentacoes")
        .select("*")
        .order("data_hora", { ascending: false })
        .range(0, fetchCount - 1);

      if (!admin) movimentacoesQuery.eq("usuario_id", req.userId);

      const { data: dataMovs, error: movsError } = await movimentacoesQuery;
      if (movsError) throw movsError;
      movs = (dataMovs ?? []) as any[];
    }

    if (wantMelosa) {
      const melosaQuery = service
        .from("melosa_movimentacoes")
        .select("*")
        .order("data_hora", { ascending: false })
        .range(0, fetchCount - 1);

      if (!admin) melosaQuery.eq("usuario_id", req.userId);

      const { data: dataMelosas, error: melosasError } = await melosaQuery;
      if (melosasError) throw melosasError;
      melosas = (dataMelosas ?? []) as any[];
    }

    const melosasUnified = melosas.map((m) => ({
      ...m,
      placa_texto: m.ativo_melosa_texto ?? null,
      fornecedor_texto: m.ativo_equipamento_texto ?? null,
      origem: "melosa" as const,
      tanque_texto: null,
      combustivel_tipo: null,
      nota_numero: null,
      placa_caminhao: null,
      valor_unitario: null,
      nota_storage_path: null,
    }));

    const movsTagged = movs.map((m) => ({ ...m, origem: "tanque" as const }));
    const combined = [...movsTagged, ...melosasUnified];
    combined.sort((a, b) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime());

    const paginated = combined.slice(offset, offset + limit);
    const obraCodigos = Array.from(new Set(paginated.map((m) => m.obra_codigo)));

    const { data: obrasData, error: obrasError } = obraCodigos.length
      ? await service.from("obras").select("codigo, nome").in("codigo", obraCodigos)
      : { data: [], error: null };

    if (obrasError) throw obrasError;

    const obraByCodigo = new Map((obrasData ?? []).map((o: any) => [o.codigo, o.nome]));

    const userIds = Array.from(
      new Set(paginated.map((m) => m.usuario_id).filter((id): id is string => typeof id === "string" && id.length > 0)),
    );

    const { data: profilesData, error: profilesError } = userIds.length
      ? await service.from("profiles").select("user_id, full_name").in("user_id", userIds)
      : { data: [], error: null };

    if (profilesError) throw profilesError;

    const fullNameByUserId = new Map(
      (profilesData ?? []).map((p: { user_id: string; full_name: string }) => [p.user_id, p.full_name]),
    );

    const movimentacoes = paginated.map((m) => ({
      ...m,
      obra_nome: obraByCodigo.get(m.obra_codigo) ?? null,
      usuario_full_name: typeof m.usuario_id === "string" ? (fullNameByUserId.get(m.usuario_id) ?? null) : null,
    }));

    return res.json({ movimentacoes });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("[API] /v1/movimentacoes error:", err);
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

router.get("/melosa/photo-url", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const rawPath = typeof req.query.path === "string" ? req.query.path.trim() : "";
    if (!rawPath) return res.status(400).json({ error: "path é obrigatório" });

    const service = createSupabaseServiceRole();
    const candidates = [
      "melosa_medidor_acumulado",
      "melosa_horimetro_equipamento_abastecido",
      "melosa_equipamento_operador",
      "melosa_lacre",
      "melosa_comprovantes",
      "melosa_tanques",
      "melosa_tanque",
    ];

    for (const bucket of candidates) {
      const { data, error } = await service.storage.from(bucket).createSignedUrl(rawPath, 3600);
      if (!error && data?.signedUrl) return res.json({ url: data.signedUrl, bucket });
    }

    return res.status(404).json({ error: "Foto não encontrada no Storage" });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

router.get("/tanque/photo-url", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const rawPath = typeof req.query.path === "string" ? req.query.path.trim() : "";
    if (!rawPath) return res.status(400).json({ error: "path é obrigatório" });

    const service = createSupabaseServiceRole();
    const buckets = [
      envValidated.NOTAS_BUCKET,
      envValidated.LACRE_TANQUE_BUCKET,
      envValidated.LACRE_MELOSA_BUCKET,
      envValidated.MEDIDOR_TANQUE_BUCKET,
      envValidated.CONFIRMACAO_ABASTECIMENTO_BUCKET,
    ];

    for (const bucket of buckets) {
      const { data, error } = await service.storage.from(bucket).createSignedUrl(rawPath, 3600);
      if (!error && data?.signedUrl) return res.json({ url: data.signedUrl, bucket });
    }

    return res.status(404).json({ error: "Foto não encontrada no Storage" });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

router.patch("/melosa/movimentacoes/:operationId", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });
    const operationId = String(req.params.operationId ?? "");
    const parsedId = z.string().uuid().safeParse(operationId);
    if (!parsedId.success) return res.status(400).json({ error: "operationId inválido" });

    const parsedBody = melosaUpdateSchema.safeParse(req.body);
    if (!parsedBody.success) return res.status(400).json({ error: parsedBody.error.flatten() });

    const service = createSupabaseServiceRole();
    const { data: current, error: currentError } = await service
      .from("melosa_movimentacoes")
      .select("operation_id, usuario_id")
      .eq("operation_id", operationId)
      .maybeSingle();

    if (currentError) return res.status(400).json({ error: currentError.message });
    if (!current) return res.status(404).json({ error: "Movimentação não encontrada" });

    const admin = await isAdmin(service, req.userId);
    if (!admin && current.usuario_id !== req.userId) {
      return res.status(403).json({ error: "Sem permissão para editar esta movimentação" });
    }

    const { error: updateError } = await service
      .from("melosa_movimentacoes")
      .update(sanitizeMelosaRowForDb(parsedBody.data as Record<string, unknown>))
      .eq("operation_id", operationId);

    if (updateError) return res.status(400).json({ error: updateError.message });
    return res.json({ ok: true, operation_id: operationId });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

router.delete("/melosa/movimentacoes/:operationId", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });
    const operationId = String(req.params.operationId ?? "");
    const parsedId = z.string().uuid().safeParse(operationId);
    if (!parsedId.success) return res.status(400).json({ error: "operationId inválido" });

    const service = createSupabaseServiceRole();
    const { data: current, error: currentError } = await service
      .from("melosa_movimentacoes")
      .select("operation_id, usuario_id")
      .eq("operation_id", operationId)
      .maybeSingle();

    if (currentError) return res.status(400).json({ error: currentError.message });
    if (!current) return res.status(404).json({ error: "Movimentação não encontrada" });

    const admin = await isAdmin(service, req.userId);
    if (!admin && current.usuario_id !== req.userId) {
      return res.status(403).json({ error: "Sem permissão para excluir esta movimentação" });
    }

    const { error: deleteError } = await service.from("melosa_movimentacoes").delete().eq("operation_id", operationId);
    if (deleteError) return res.status(400).json({ error: deleteError.message });
    return res.json({ ok: true, operation_id: operationId });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

router.patch("/tanque/movimentacoes/:operationId", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });
    const operationId = String(req.params.operationId ?? "");
    const parsedId = z.string().uuid().safeParse(operationId);
    if (!parsedId.success) return res.status(400).json({ error: "operationId inválido" });

    const parsedBody = tanqueUpdateSchema.safeParse(req.body);
    if (!parsedBody.success) return res.status(400).json({ error: parsedBody.error.flatten() });

    const service = createSupabaseServiceRole();
    const { data: current, error: currentError } = await service
      .from("movimentacoes")
      .select("operation_id, usuario_id, tipo")
      .eq("operation_id", operationId)
      .maybeSingle();

    if (currentError) return res.status(400).json({ error: currentError.message });
    if (!current) return res.status(404).json({ error: "Movimentação não encontrada" });

    const admin = await isAdmin(service, req.userId);
    if (!admin && current.usuario_id !== req.userId) {
      return res.status(403).json({ error: "Sem permissão para editar esta movimentação" });
    }

    if (current.tipo !== "ENTRADA_TANQUE_OBRA" && current.tipo !== "RETIRADA_TANQUE") {
      return res.status(400).json({ error: "Esta rota edita apenas movimentações de tanque" });
    }

    const { error: updateError } = await service
      .from("movimentacoes")
      .update(parsedBody.data as any)
      .eq("operation_id", operationId);

    if (updateError) return res.status(400).json({ error: updateError.message });
    return res.json({ ok: true, operation_id: operationId });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

router.delete("/tanque/movimentacoes/:operationId", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });
    const operationId = String(req.params.operationId ?? "");
    const parsedId = z.string().uuid().safeParse(operationId);
    if (!parsedId.success) return res.status(400).json({ error: "operationId inválido" });

    const service = createSupabaseServiceRole();
    const { data: current, error: currentError } = await service
      .from("movimentacoes")
      .select("operation_id, usuario_id, tipo")
      .eq("operation_id", operationId)
      .maybeSingle();

    if (currentError) return res.status(400).json({ error: currentError.message });
    if (!current) return res.status(404).json({ error: "Movimentação não encontrada" });

    const admin = await isAdmin(service, req.userId);
    if (!admin && current.usuario_id !== req.userId) {
      return res.status(403).json({ error: "Sem permissão para excluir esta movimentação" });
    }

    if (current.tipo !== "ENTRADA_TANQUE_OBRA" && current.tipo !== "RETIRADA_TANQUE") {
      return res.status(400).json({ error: "Esta rota exclui apenas movimentações de tanque" });
    }

    const { error: deleteError } = await service.from("movimentacoes").delete().eq("operation_id", operationId);
    if (deleteError) return res.status(400).json({ error: deleteError.message });
    return res.json({ ok: true, operation_id: operationId });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

router.post("/movimentacoes", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });

    const parsed = movimentoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const service = createSupabaseServiceRole();
    const melosaDriver = await isMelosaDriver(service, req.userId);

    const payload = parsed.data;
    const isTanqueTipo = payload.tipo === "ENTRADA_TANQUE_OBRA" || payload.tipo === "RETIRADA_TANQUE";
    if (melosaDriver && isTanqueTipo) {
      return res.status(403).json({ error: "Perfil Melosa: somente movimentações da Melosa são permitidas." });
    }

    const placaNorm =
      (payload.ativo_melosa_texto?.trim() || payload.placa_texto?.trim() || "").trim() || null;
    const fornecedorNorm =
      (payload.ativo_equipamento_texto?.trim() || payload.fornecedor_texto?.trim() || "").trim() || null;
    const tanqueNum = payload.tanque_numero;

    const needsVeiculoMeta =
      payload.tipo === "ENTRADA_TANQUE_OBRA" ||
      payload.tipo === "RETIRADA_TANQUE" ||
      payload.tipo === "RETIRADA_MELOSA";
    if (needsVeiculoMeta) {
      if (!placaNorm) {
        return res.status(400).json({ error: "placa_texto é obrigatório" });
      }
      if (!fornecedorNorm) {
        return res.status(400).json({ error: "fornecedor_texto é obrigatório" });
      }
      if (tanqueNum !== 1 && tanqueNum !== 2) {
        return res.status(400).json({ error: "tanque_numero é obrigatório e deve ser 1 ou 2" });
      }
    }

    const needsNota = payload.tipo === "ENTRADA_TANQUE_OBRA";

    if (needsNota) {
      const notaStoragePath = payload.nota_storage_path;
      if (!notaStoragePath || notaStoragePath.trim().length === 0) {
        return res.status(400).json({ error: "nota_storage_path é obrigatório" });
      }
      if (!payload.combustivel_tipo) return res.status(400).json({ error: "combustivel_tipo é obrigatório" });
      if (!payload.nota_numero) return res.status(400).json({ error: "nota_numero é obrigatório" });
      if (payload.valor_unitario === undefined || payload.valor_unitario === null) {
        return res.status(400).json({ error: "valor_unitario é obrigatório" });
      }

      const { data: noteExists } = await service.storage.from(envValidated.NOTAS_BUCKET).exists(notaStoragePath);
      if (noteExists !== true) {
        return res.status(400).json({ error: "Arquivo da nota não encontrado no Storage" });
      }
    }

    if (payload.tipo === "RETIRADA_TANQUE") {
      if (!payload.lacre_tanque_numero?.trim()) {
        return res.status(400).json({ error: "lacre_tanque_numero é obrigatório" });
      }
      if (!payload.lacre_tanque_storage_path?.trim()) {
        return res.status(400).json({ error: "lacre_tanque_storage_path é obrigatório" });
      }
      if (!payload.lacre_melosa_numero?.trim()) {
        return res.status(400).json({ error: "lacre_melosa_numero é obrigatório" });
      }
      if (!payload.lacre_melosa_storage_path?.trim()) {
        return res.status(400).json({ error: "lacre_melosa_storage_path é obrigatório" });
      }
      if (!payload.medidor_tanque_numero_inicial?.trim()) {
        return res.status(400).json({ error: "medidor_tanque_numero_inicial é obrigatório" });
      }
      if (!payload.medidor_tanque_foto_inicial_storage_path?.trim()) {
        return res.status(400).json({ error: "medidor_tanque_foto_inicial_storage_path é obrigatório" });
      }
      if (!payload.medidor_tanque_numero_final?.trim()) {
        return res.status(400).json({ error: "medidor_tanque_numero_final é obrigatório" });
      }
      if (!payload.medidor_tanque_foto_final_storage_path?.trim()) {
        return res.status(400).json({ error: "medidor_tanque_foto_final_storage_path é obrigatório" });
      }
      if (!payload.confirmacao_abastecimento_foto_storage_path?.trim()) {
        return res.status(400).json({ error: "confirmacao_abastecimento_foto_storage_path é obrigatório" });
      }

      const { data: lacreTanqueExists } = await service.storage
        .from(envValidated.LACRE_TANQUE_BUCKET)
        .exists(payload.lacre_tanque_storage_path);
      if (lacreTanqueExists !== true) {
        return res.status(400).json({ error: "Arquivo do lacre do tanque não encontrado no Storage" });
      }

      const { data: lacreMelosaExists } = await service.storage
        .from(envValidated.LACRE_MELOSA_BUCKET)
        .exists(payload.lacre_melosa_storage_path);
      if (lacreMelosaExists !== true) {
        return res.status(400).json({ error: "Arquivo do lacre da melosa não encontrado no Storage" });
      }

      const { data: medidorInicialExists } = await service.storage
        .from(envValidated.MEDIDOR_TANQUE_BUCKET)
        .exists(payload.medidor_tanque_foto_inicial_storage_path);
      if (medidorInicialExists !== true) {
        return res.status(400).json({ error: "Foto inicial do medidor do tanque não encontrada no Storage" });
      }

      const { data: medidorFinalExists } = await service.storage
        .from(envValidated.MEDIDOR_TANQUE_BUCKET)
        .exists(payload.medidor_tanque_foto_final_storage_path);
      if (medidorFinalExists !== true) {
        return res.status(400).json({ error: "Foto final do medidor do tanque não encontrada no Storage" });
      }

      const { data: confirmacaoExists } = await service.storage
        .from(envValidated.CONFIRMACAO_ABASTECIMENTO_BUCKET)
        .exists(payload.confirmacao_abastecimento_foto_storage_path);
      if (confirmacaoExists !== true) {
        return res.status(400).json({ error: "Foto de confirmação do abastecimento não encontrada no Storage" });
      }
    }

    if (payload.tipo === "RETIRADA_MELOSA") {
      const categoria = payload.melosa_categoria ?? null;
      if (categoria != null && categoria !== "ESTACIONARIA" && categoria !== "MOVEL") {
        return res.status(400).json({ error: "melosa_categoria inválido (use ESTACIONARIA ou MOVEL)" });
      }
      if (!payload.melosa_medidor_acumulado_inicial_numero?.trim()) {
        return res.status(400).json({ error: "melosa_medidor_acumulado_inicial_numero é obrigatório" });
      }
      if (!payload.melosa_medidor_acumulado_inicial_storage_path?.trim()) {
        return res.status(400).json({ error: "melosa_medidor_acumulado_inicial_storage_path é obrigatório" });
      }
      const medidorInicialOk = await storageObjectExists(
        service,
        envValidated.MELOSA_MEDIDOR_ACUMULADO_BUCKET,
        payload.melosa_medidor_acumulado_inicial_storage_path
      );
      if (!medidorInicialOk) {
        return res.status(400).json({
          error: "Foto inicial acumulada do medidor da melosa não encontrada no Storage",
          bucket: envValidated.MELOSA_MEDIDOR_ACUMULADO_BUCKET,
          path: payload.melosa_medidor_acumulado_inicial_storage_path,
        });
      }

      if (!payload.melosa_horimetro_equipamento_abastecido_numero?.trim()) {
        return res.status(400).json({ error: "melosa_horimetro_equipamento_abastecido_numero é obrigatório" });
      }
      if (!payload.melosa_horimetro_equipamento_abastecido_storage_path?.trim()) {
        return res.status(400).json({ error: "melosa_horimetro_equipamento_abastecido_storage_path é obrigatório" });
      }
      const horimetroOk = await storageObjectExists(
        service,
        envValidated.MELOSA_HORIMETRO_EQUIPAMENTO_ABASTECIDO_BUCKET,
        payload.melosa_horimetro_equipamento_abastecido_storage_path
      );
      if (!horimetroOk) {
        return res.status(400).json({ error: "Foto do hodômetro do equipamento abastecido não encontrada no Storage" });
      }

      if (!payload.melosa_motorista_equipamento_abastecido?.trim()) {
        return res.status(400).json({ error: "melosa_motorista_equipamento_abastecido é obrigatório" });
      }
      if (!payload.melosa_equipamento_operador_storage_path?.trim()) {
        return res.status(400).json({ error: "melosa_equipamento_operador_storage_path é obrigatório" });
      }
      const operadorOk = await storageObjectExists(
        service,
        envValidated.MELOSA_EQUIPAMENTO_OPERADOR_BUCKET,
        payload.melosa_equipamento_operador_storage_path
      );
      if (!operadorOk) {
        return res.status(400).json({
          error: "Foto do equipamento junto com o operador/motorista não encontrada no Storage",
        });
      }

      const lacreNumero = payload.melosa_lacre_numero?.trim() ?? "";
      const lacrePath = payload.melosa_lacre_storage_path?.trim() ?? "";
      if (lacreNumero && !lacrePath) {
        return res.status(400).json({ error: "melosa_lacre_storage_path é obrigatório quando há número do lacre" });
      }
      if (lacrePath) {
        const lacreOk = await storageObjectExists(service, envValidated.MELOSA_LACRE_BUCKET, lacrePath);
        if (!lacreOk) {
          return res.status(400).json({ error: "Foto do lacre não encontrada no Storage" });
        }
      }

      if (!payload.melosa_medidor_acumulado_final_numero?.trim()) {
        return res.status(400).json({ error: "melosa_medidor_acumulado_final_numero é obrigatório" });
      }
      const medidorInicial = parseMedidorMelosaNumero(payload.melosa_medidor_acumulado_inicial_numero);
      const medidorFinal = parseMedidorMelosaNumero(payload.melosa_medidor_acumulado_final_numero);
      if (medidorInicial == null || medidorFinal == null) {
        return res.status(400).json({ error: "Números do medidor inicial e final inválidos" });
      }
      if (medidorFinal <= medidorInicial) {
        return res.status(400).json({
          error: "O número final acumulado do medidor deve ser maior que o inicial (litros = final − inicial)",
        });
      }
      const litrosMelosaCalculados = medidorFinal - medidorInicial;
      if (!payload.melosa_medidor_acumulado_final_storage_path?.trim()) {
        return res.status(400).json({ error: "melosa_medidor_acumulado_final_storage_path é obrigatório" });
      }
      const medidorFinalOk = await storageObjectExists(
        service,
        envValidated.MELOSA_MEDIDOR_ACUMULADO_BUCKET,
        payload.melosa_medidor_acumulado_final_storage_path
      );
      if (!medidorFinalOk) {
        return res.status(400).json({ error: "Foto final acumulada do medidor da melosa não encontrada no Storage" });
      }

      const insertRowMelosa = {
        operation_id: payload.operation_id,
        usuario_id: req.userId,
        tipo: payload.tipo,
        obra_codigo: payload.obra_codigo,
        data_hora: payload.data_hora ? new Date(payload.data_hora).toISOString() : new Date().toISOString(),
        litros: litrosMelosaCalculados,

        melosa_km_registro: payload.melosa_km_registro ?? null,
        melosa_litros_registro: payload.melosa_litros_registro ?? null,
        melosa_combustivel_tipo_registro: payload.melosa_combustivel_tipo_registro ?? null,
        melosa_comprovante_storage_path: payload.melosa_comprovante_storage_path ?? null,
        melosa_medidor_acumulado_inicial_numero: payload.melosa_medidor_acumulado_inicial_numero ?? null,
        melosa_medidor_acumulado_inicial_storage_path: payload.melosa_medidor_acumulado_inicial_storage_path ?? null,
        melosa_lacre_numero: lacreNumero || null,
        melosa_lacre_storage_path: lacrePath || null,
        melosa_medidor_acumulado_final_numero: payload.melosa_medidor_acumulado_final_numero ?? null,
        melosa_medidor_acumulado_final_storage_path: payload.melosa_medidor_acumulado_final_storage_path ?? null,
        melosa_horimetro_equipamento_abastecido_numero: payload.melosa_horimetro_equipamento_abastecido_numero ?? null,
        melosa_horimetro_equipamento_abastecido_storage_path:
          payload.melosa_horimetro_equipamento_abastecido_storage_path ?? null,
        melosa_motorista_equipamento_abastecido: payload.melosa_motorista_equipamento_abastecido ?? null,
        melosa_equipamento_operador_storage_path: payload.melosa_equipamento_operador_storage_path ?? null,
        melosa_categoria: categoria,

        melosa_km_retirada: payload.melosa_km_retirada ?? null,
        melosa_combustivel_tipo_retirada: payload.melosa_combustivel_tipo_retirada ?? null,
        melosa_tanque_storage_path: payload.melosa_tanque_storage_path ?? null,

        ativo_melosa_texto: placaNorm,
        ativo_equipamento_texto: fornecedorNorm,
        tanque_numero: tanqueNum,
        local_latitude: payload.local_latitude ?? null,
        local_longitude: payload.local_longitude ?? null,
        local_address: payload.local_address ?? null,
        obs: payload.obs ?? null,
      };

      const { error } = await service
        .from("melosa_movimentacoes")
        .upsert(sanitizeMelosaRowForDb(insertRowMelosa as Record<string, unknown>), {
          onConflict: "operation_id",
        });

      if (error) return res.status(400).json({ error: error.message });
      return res.json({ ok: true, operation_id: payload.operation_id });
    }

    const placaCaminhaoRow =
      payload.placa_caminhao?.trim() ||
      (isTanqueTipo && placaNorm ? placaNorm : null) ||
      null;

    let litrosGravados = payload.litros;
    if (payload.tipo === "RETIRADA_TANQUE") {
      const litrosMedidor = litrosRetiradaTanqueFromMedidores(
        payload.medidor_tanque_numero_inicial,
        payload.medidor_tanque_numero_final,
      );
      if (litrosMedidor != null && litrosMedidor > 0) litrosGravados = litrosMedidor;
    }

    const insertRow = {
      operation_id: payload.operation_id,
      usuario_id: req.userId,
      tipo: payload.tipo,
      obra_codigo: payload.obra_codigo,
      data_hora: payload.data_hora ? new Date(payload.data_hora).toISOString() : new Date().toISOString(),
      litros: litrosGravados,
      tanque_texto: payload.tanque_texto ?? null,

      combustivel_tipo: payload.combustivel_tipo ?? null,
      nota_numero: payload.nota_numero ?? null,
      placa_caminhao: placaCaminhaoRow,
      valor_unitario: payload.valor_unitario ?? null,
      nota_storage_path: payload.nota_storage_path ?? null,
      lacre_tanque_numero: payload.lacre_tanque_numero ?? null,
      lacre_tanque_storage_path: payload.lacre_tanque_storage_path ?? null,
      lacre_melosa_numero: payload.lacre_melosa_numero ?? null,
      lacre_melosa_storage_path: payload.lacre_melosa_storage_path ?? null,
      medidor_tanque_numero_inicial: payload.medidor_tanque_numero_inicial ?? null,
      medidor_tanque_foto_inicial_storage_path: payload.medidor_tanque_foto_inicial_storage_path ?? null,
      medidor_tanque_numero_final: payload.medidor_tanque_numero_final ?? null,
      medidor_tanque_foto_final_storage_path: payload.medidor_tanque_foto_final_storage_path ?? null,
      confirmacao_abastecimento_foto_storage_path: payload.confirmacao_abastecimento_foto_storage_path ?? null,

      placa_texto: needsVeiculoMeta ? placaNorm : null,
      fornecedor_texto: needsVeiculoMeta ? fornecedorNorm : null,
      tanque_numero: needsVeiculoMeta ? tanqueNum : null,
      local_latitude: payload.local_latitude ?? null,
      local_longitude: payload.local_longitude ?? null,
      local_address: payload.local_address ?? null,
      obs: payload.obs ?? null,
    };

    const { error } = await service
      .from("movimentacoes")
      .upsert(insertRow as any, { onConflict: "operation_id" });

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ ok: true, operation_id: payload.operation_id });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

export default router;

