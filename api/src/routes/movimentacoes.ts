import { randomUUID } from "crypto";
import { Router } from "express";
import { z } from "zod";
import { createSupabaseServiceRole } from "../lib/supabase";
import { criarCicloRetiradaTanque, vincularAbastecimentoAoCicloAberto } from "../lib/melosaCiclo";
import { registrarTransferenciaMelosa } from "../lib/melosaTransferencia";
import { parseMedidorNumero } from "../lib/melosaMedidorContinuidade";
import { envValidated } from "../config";
import { normalizeEquipamentoEmpresa } from "../lib/equipamentoEmpresa";
import { requireAuth, type AuthedRequest } from "../middleware/requireAuth";
import { assertUserObraAccess, getUserObraCodigos, ObraAccessError } from "../lib/userObras";
import { logMovimentacaoAudit } from "../lib/movimentacaoAudit";
import { denyWebBiWriteIfNeeded, loadWebWriteProfile } from "../lib/webWriteAccess";
import { canWriteBiAction } from "../lib/webPermissions";
import {
  storageCreateSignedUrl,
  storageDownload,
  storageExists,
  storageUpload,
} from "../lib/storage";
import { buildMonthOrganizedStoragePath } from "../lib/storage/photoNaming";

const router = Router();

async function storageObjectExists(
  _service: ReturnType<typeof createSupabaseServiceRole>,
  bucket: string,
  storagePath: string
): Promise<boolean> {
  const path = storagePath.trim().replace(/^\/+/, "");
  if (!path) return false;
  return storageExists(bucket, path);
}

const MELOSA_PHOTO_BUCKETS = [
  envValidated.MELOSA_ASSINATURAS_BUCKET,
  envValidated.FOTO_QUANTIDADE_ABASTECIDA_BUCKET,
  envValidated.MELOSA_HORIMETRO_EQUIPAMENTO_ABASTECIDO_BUCKET,
  envValidated.MELOSA_EQUIPAMENTO_OPERADOR_BUCKET,
  envValidated.MELOSA_LACRE_BUCKET,
  "melosa_medidor_acumulado",
  "melosa_comprovantes",
  "melosa_tanques",
  "melosa_tanque",
] as const;

async function findMelosaStorageFile(
  _service: ReturnType<typeof createSupabaseServiceRole>,
  rawPath: string,
): Promise<{ bucket: string; path: string } | null> {
  const path = rawPath.trim().replace(/^\/+/, "");
  if (!path) return null;

  for (const bucket of MELOSA_PHOTO_BUCKETS) {
    if (await storageExists(bucket, path)) return { bucket, path };
  }
  return null;
}

const TANQUE_PHOTO_BUCKETS = [
  envValidated.NOTAS_BUCKET,
  envValidated.LACRE_TANQUE_BUCKET,
  envValidated.LACRE_MELOSA_BUCKET,
  envValidated.FOTO_QUANTIDADE_ABASTECIDA_BUCKET,
  envValidated.MEDIDOR_TANQUE_BUCKET,
  envValidated.CONFIRMACAO_ABASTECIMENTO_BUCKET,
  envValidated.RETIRADA_HORIMETRO_BUCKET,
] as const;

async function findTanqueStorageFile(
  service: ReturnType<typeof createSupabaseServiceRole>,
  rawPath: string,
): Promise<{ bucket: string; path: string } | null> {
  const path = rawPath.trim().replace(/^\/+/, "");
  if (!path) return null;

  for (const bucket of TANQUE_PHOTO_BUCKETS) {
    const exists = await storageObjectExists(service, bucket, path);
    if (exists) return { bucket, path };
  }
  return null;
}

function mimeFromStoragePath(storagePath: string): string {
  const ext = storagePath.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  return "image/png";
}

function parseMedidorMelosaNumero(value: string | null | undefined): number | null {
  return parseMedidorNumero(value);
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

const tanqueNumeroSchema = z.number().int().positive();

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
  tanque_quantidade_abastecida: z.string().optional().nullable(),
  tanque_quantidade_abastecida_storage_path: z.string().optional().nullable(),
  tanque_operador_nome: z.string().optional().nullable(),
  tanque_assinatura_operador_storage_path: z.string().optional().nullable(),
  tanque_assinatura_melosa_storage_path: z.string().optional().nullable(),
  retirada_horimetro_foto_storage_path: z.string().optional().nullable(),

  melosa_km_registro: z.number().min(0).optional().nullable(),
  melosa_litros_registro: z.number().min(0).optional().nullable(),
  melosa_combustivel_tipo_registro: z.string().optional().nullable(),
  melosa_comprovante_storage_path: z.string().optional().nullable(),
  melosa_quantidade_abastecida: z.string().optional().nullable(),
  melosa_quantidade_abastecida_storage_path: z.string().optional().nullable(),
  melosa_encerrante_inicial_numero: z.string().optional().nullable(),
  melosa_encerrante_final_numero: z.string().optional().nullable(),
  melosa_lacre_numero: z.string().optional().nullable(),
  melosa_lacre_storage_path: z.string().optional().nullable(),
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
  ativo_equipamento_empresa: z.string().optional().nullable(),
  ativo_equipamento_nome: z.string().optional().nullable(),
  melosa_operador_nome: z.string().optional().nullable(),
  melosa_assinatura_operador_storage_path: z.string().optional().nullable(),
  melosa_assinatura_motorista_storage_path: z.string().optional().nullable(),
  melosa_lubrificado: z.boolean().optional().nullable(),
  tanque_numero: tanqueNumeroSchema.optional().nullable(),
  local_latitude: z.number().optional().nullable(),
  local_longitude: z.number().optional().nullable(),
  local_address: z.string().optional().nullable(),

  obs: z.string().optional().nullable(),
});

const melosaWebCreateSchema = z
  .object({
    obra_codigo: z.number().int(),
    data_hora: z.string().datetime(),
    ativo_melosa_texto: z.string().min(1),
    ativo_equipamento_texto: z.string().min(1),
    tanque_numero: z.union([z.literal(1), z.literal(2)]).optional().nullable(),
    quantidade_litros: z.number().positive(),
    melosa_combustivel_tipo_retirada: z.string().optional().nullable(),
    melosa_combustivel_tipo_registro: z.string().optional().nullable(),
    melosa_categoria: z.enum(["ESTACIONARIA", "MOVEL"]).optional().nullable(),
    melosa_horimetro_equipamento_abastecido_numero: z.string().optional().nullable(),
    melosa_motorista_equipamento_abastecido: z.string().optional().nullable(),
    melosa_operador_nome: z.string().optional().nullable(),
    melosa_lubrificado: z.boolean().optional().nullable(),
    obs: z.string().optional().nullable(),
  })
  .refine(
    (data) =>
      Boolean(data.melosa_combustivel_tipo_retirada?.trim() || data.melosa_combustivel_tipo_registro?.trim()),
    { message: "Informe o insumo/combustível" },
  );

const melosaUpdateSchema = z
  .object({
    obra_codigo: z.number().int().optional(),
    data_hora: z.string().datetime().optional(),
    litros: z.number().min(0).optional(),
    melosa_km_registro: z.number().min(0).optional().nullable(),
    melosa_km_retirada: z.number().min(0).optional().nullable(),
    melosa_combustivel_tipo_registro: z.string().optional().nullable(),
    melosa_combustivel_tipo_retirada: z.string().optional().nullable(),
    melosa_quantidade_abastecida: z.string().optional().nullable(),
    melosa_quantidade_abastecida_storage_path: z.string().optional().nullable(),
    melosa_horimetro_equipamento_abastecido_numero: z.string().optional().nullable(),
    melosa_horimetro_equipamento_abastecido_storage_path: z.string().optional().nullable(),
    melosa_equipamento_operador_storage_path: z.string().optional().nullable(),
    melosa_assinatura_operador_storage_path: z.string().optional().nullable(),
    melosa_assinatura_motorista_storage_path: z.string().optional().nullable(),
    melosa_motorista_equipamento_abastecido: z.string().optional().nullable(),
    melosa_categoria: z.enum(["ESTACIONARIA", "MOVEL"]).optional().nullable(),
    melosa_operador_nome: z.string().optional().nullable(),
    melosa_lubrificado: z.boolean().optional().nullable(),
    ativo_melosa_texto: z.string().optional().nullable(),
    ativo_equipamento_texto: z.string().optional().nullable(),
    ativo_equipamento_empresa: z.string().optional().nullable(),
    ativo_equipamento_nome: z.string().optional().nullable(),
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
    tanque_quantidade_abastecida: z.string().optional().nullable(),
    tanque_quantidade_abastecida_storage_path: z.string().optional().nullable(),
    retirada_horimetro_foto_storage_path: z.string().optional().nullable(),
    obs: z.string().optional().nullable(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "Informe ao menos um campo para editar",
  });

const MELOSA_PHOTO_KINDS = {
  quantidade: {
    column: "melosa_quantidade_abastecida_storage_path",
    bucket: () => envValidated.FOTO_QUANTIDADE_ABASTECIDA_BUCKET,
    pathSuffix: (operationId: string, ext: string) =>
      `melosa/quantidade-abastecida/${operationId}.${ext}`,
  },
  horimetro: {
    column: "melosa_horimetro_equipamento_abastecido_storage_path",
    bucket: () => envValidated.MELOSA_HORIMETRO_EQUIPAMENTO_ABASTECIDO_BUCKET,
    pathSuffix: (operationId: string, ext: string) => `melosa/horimetro/${operationId}.${ext}`,
  },
  operador: {
    column: "melosa_equipamento_operador_storage_path",
    bucket: () => envValidated.MELOSA_EQUIPAMENTO_OPERADOR_BUCKET,
    pathSuffix: (operationId: string, ext: string) =>
      `melosa/equipamento-operador/${operationId}.${ext}`,
  },
  assinatura_operador: {
    column: "melosa_assinatura_operador_storage_path",
    bucket: () => envValidated.MELOSA_ASSINATURAS_BUCKET,
    pathSuffix: (operationId: string, ext: string) =>
      `melosa/assinaturas/operador/${operationId}.${ext}`,
  },
  assinatura_motorista: {
    column: "melosa_assinatura_motorista_storage_path",
    bucket: () => envValidated.MELOSA_ASSINATURAS_BUCKET,
    pathSuffix: (operationId: string, ext: string) =>
      `melosa/assinaturas/motorista/${operationId}.${ext}`,
  },
} as const;

type MelosaPhotoKind = keyof typeof MELOSA_PHOTO_KINDS;

const melosaPhotoUploadSchema = z.object({
  kind: z.enum([
    "quantidade",
    "horimetro",
    "operador",
    "assinatura_operador",
    "assinatura_motorista",
  ]),
  /** data URL (data:image/...;base64,...) ou base64 puro */
  data_base64: z.string().min(32),
  content_type: z.string().optional(),
  filename: z.string().optional(),
});

const TANQUE_PHOTO_KINDS = {
  nota: {
    column: "nota_storage_path",
    bucket: () => envValidated.NOTAS_BUCKET,
    pathSuffix: (operationId: string, ext: string) => `notas/${operationId}.${ext}`,
    tipos: ["ENTRADA_TANQUE_OBRA"] as const,
  },
  quantidade: {
    column: "tanque_quantidade_abastecida_storage_path",
    bucket: () => envValidated.FOTO_QUANTIDADE_ABASTECIDA_BUCKET,
    pathSuffix: (operationId: string, ext: string) => `tanque/quantidade/${operationId}.${ext}`,
    tipos: ["RETIRADA_TANQUE"] as const,
  },
  lacre_tanque: {
    column: "lacre_tanque_storage_path",
    bucket: () => envValidated.LACRE_TANQUE_BUCKET,
    pathSuffix: (operationId: string, ext: string) => `lacres/tanque/${operationId}.${ext}`,
    tipos: ["RETIRADA_TANQUE"] as const,
  },
  lacre_melosa: {
    column: "lacre_melosa_storage_path",
    bucket: () => envValidated.LACRE_MELOSA_BUCKET,
    pathSuffix: (operationId: string, ext: string) => `lacres/melosa/${operationId}.${ext}`,
    tipos: ["RETIRADA_TANQUE"] as const,
  },
  assinatura_operador: {
    column: "tanque_assinatura_operador_storage_path",
    bucket: () => envValidated.MELOSA_ASSINATURAS_BUCKET,
    pathSuffix: (operationId: string, ext: string) => `tanque/assinaturas/operador/${operationId}.${ext}`,
    tipos: ["ENTRADA_TANQUE_OBRA", "RETIRADA_TANQUE"] as const,
  },
  assinatura_melosa: {
    column: "tanque_assinatura_melosa_storage_path",
    bucket: () => envValidated.MELOSA_ASSINATURAS_BUCKET,
    pathSuffix: (operationId: string, ext: string) => `tanque/assinaturas/melosa/${operationId}.${ext}`,
    tipos: ["ENTRADA_TANQUE_OBRA", "RETIRADA_TANQUE"] as const,
  },
  horimetro: {
    column: "retirada_horimetro_foto_storage_path",
    bucket: () => envValidated.RETIRADA_HORIMETRO_BUCKET,
    pathSuffix: (operationId: string, ext: string) => `tanque/horimetro/${operationId}.${ext}`,
    tipos: ["RETIRADA_TANQUE"] as const,
  },
} as const;

type TanquePhotoKind = keyof typeof TANQUE_PHOTO_KINDS;

const tanquePhotoUploadSchema = z.object({
  kind: z.enum([
    "nota",
    "quantidade",
    "lacre_tanque",
    "lacre_melosa",
    "assinatura_operador",
    "assinatura_melosa",
    "horimetro",
  ]),
  data_base64: z.string().min(32),
  content_type: z.string().optional(),
  filename: z.string().optional(),
});

function parseImageBase64Payload(raw: string, contentTypeHint?: string): {
  bytes: Buffer;
  contentType: string;
  ext: string;
} {
  let contentType = (contentTypeHint ?? "").trim().toLowerCase();
  let b64 = raw.trim();
  const dataUrlMatch = /^data:([^;]+);base64,(.+)$/is.exec(b64);
  if (dataUrlMatch) {
    contentType = dataUrlMatch[1].trim().toLowerCase();
    b64 = dataUrlMatch[2];
  }
  if (!contentType.startsWith("image/")) contentType = "image/jpeg";
  const ext =
    contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : contentType.includes("gif")
          ? "gif"
          : "jpg";
  const bytes = Buffer.from(b64.replace(/\s/g, ""), "base64");
  if (!bytes.length) throw new Error("Imagem inválida");
  if (bytes.length > 10 * 1024 * 1024) throw new Error("Imagem muito grande (máx. 10 MB)");
  return { bytes, contentType, ext };
}

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

const tanqueRetiradaEquipamentoWebSchema = z.object({
  obra_codigo: z.number().int(),
  data_hora: z.string().datetime(),
  tanque_numero: tanqueNumeroSchema,
  ativo_equipamento_texto: z.string().min(1),
  quantidade_litros: z.number().positive(),
  combustivel_tipo: z.string().optional().nullable(),
  obs: z.string().optional().nullable(),
});

const tanqueEntradaCombustivelWebSchema = z.object({
  obra_codigo: z.number().int(),
  data_hora: z.string().datetime(),
  tanque_numero: tanqueNumeroSchema,
  litros: z.number().positive(),
  combustivel_tipo: z.string().trim().min(1),
  nota_numero: z.string().trim().optional().nullable(),
  valor_unitario: z.number().nonnegative().optional().nullable(),
  placa_texto: z.string().trim().optional().nullable(),
  fornecedor_texto: z.string().trim().optional().nullable(),
  obs: z.string().optional().nullable(),
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
  "melosa_quantidade_abastecida",
  "melosa_quantidade_abastecida_storage_path",
  "melosa_encerrante_inicial_numero",
  "melosa_encerrante_final_numero",
  "melosa_lacre_numero",
  "melosa_lacre_storage_path",
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
  "ativo_equipamento_empresa",
  "ativo_equipamento_nome",
  "melosa_operador_nome",
  "melosa_assinatura_operador_storage_path",
  "melosa_assinatura_motorista_storage_path",
  "melosa_lubrificado",
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

const BI_WRITE_DENIED =
  "Sem permissão para alterar movimentações neste BI. Peça ao administrador.";

/**
 * Utilizador web precisa de permissão granular no BI.
 * Motoristas do app mantêm o fluxo próprio (dono/obra).
 */
async function denyIfNoBiWrite(
  service: ReturnType<typeof createSupabaseServiceRole>,
  userId: string,
  page: "bi_tanque" | "bi_melosa",
  action: "add" | "edit" | "delete",
): Promise<{ status: number; error: string } | null> {
  return denyWebBiWriteIfNeeded(service, userId, page, action);
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
    const obraScope = await getUserObraCodigos(service, req.userId);

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

      if (obraScope) {
        movimentacoesQuery.in("obra_codigo", obraScope);
      } else if (!admin) {
        movimentacoesQuery.eq("usuario_id", req.userId);
      }

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

      if (obraScope) {
        melosaQuery.in("obra_codigo", obraScope);
      } else if (!admin) {
        melosaQuery.eq("usuario_id", req.userId);
      }

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
      ? await service.from("profiles").select("user_id, full_name, email").in("user_id", userIds)
      : { data: [], error: null };

    if (profilesError) throw profilesError;

    const fullNameByUserId = new Map(
      (profilesData ?? []).map((p: { user_id: string; full_name: string }) => [p.user_id, p.full_name]),
    );

    const looksLikeEmail = (v: unknown): v is string =>
      typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

    const operadorEmails = Array.from(
      new Set(
        paginated
          .map((m) => (looksLikeEmail(m.melosa_operador_nome) ? String(m.melosa_operador_nome).trim().toLowerCase() : null))
          .filter((e): e is string => Boolean(e)),
      ),
    );

    const { data: profilesByEmail, error: profilesByEmailError } = operadorEmails.length
      ? await service.from("profiles").select("email, full_name").in("email", operadorEmails)
      : { data: [], error: null };

    if (profilesByEmailError) throw profilesByEmailError;

    const fullNameByEmail = new Map(
      (profilesByEmail ?? [])
        .filter((p: { email?: string | null; full_name?: string | null }) => p.email && p.full_name)
        .map((p: { email: string; full_name: string }) => [String(p.email).trim().toLowerCase(), String(p.full_name).trim()]),
    );

    const resolveOperadorNome = (m: {
      melosa_operador_nome?: string | null;
      usuario_id?: string | null;
    }): string | null => {
      const raw = typeof m.melosa_operador_nome === "string" ? m.melosa_operador_nome.trim() : "";
      const usuarioNome =
        typeof m.usuario_id === "string" ? (fullNameByUserId.get(m.usuario_id)?.trim() || null) : null;

      if (raw && !looksLikeEmail(raw)) return raw;
      if (raw && looksLikeEmail(raw)) {
        const byEmail = fullNameByEmail.get(raw.toLowerCase());
        if (byEmail) return byEmail;
        if (usuarioNome) return usuarioNome;
        return raw;
      }
      return usuarioNome;
    };

    const movimentacoes = paginated.map((m) => ({
      ...m,
      obra_nome: obraByCodigo.get(m.obra_codigo) ?? null,
      usuario_full_name: typeof m.usuario_id === "string" ? (fullNameByUserId.get(m.usuario_id) ?? null) : null,
      melosa_operador_nome: resolveOperadorNome(m),
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
    const found = await findMelosaStorageFile(service, rawPath);
    if (!found) return res.status(404).json({ error: "Foto não encontrada no Storage" });

    const url = await storageCreateSignedUrl(found.bucket, found.path, 3600);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    return res.json({ url, bucket: found.bucket });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

router.get("/melosa/photo-data", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const rawPath = typeof req.query.path === "string" ? req.query.path.trim() : "";
    if (!rawPath) return res.status(400).json({ error: "path é obrigatório" });

    const service = createSupabaseServiceRole();
    const found = await findMelosaStorageFile(service, rawPath);
    if (!found) return res.status(404).json({ error: "Foto não encontrada no Storage" });

    const buf = await storageDownload(found.bucket, found.path);
    const contentType = mimeFromStoragePath(found.path);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    return res.json({
      dataUrl: `data:${contentType};base64,${buf.toString("base64")}`,
      bucket: found.bucket,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

router.get("/tanque/photo-url", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const rawPath = typeof req.query.path === "string" ? req.query.path.trim() : "";
    if (!rawPath) return res.status(400).json({ error: "path é obrigatório" });

    const service = createSupabaseServiceRole();
    const found = await findTanqueStorageFile(service, rawPath);
    if (!found) return res.status(404).json({ error: "Foto não encontrada no Storage" });

    const url = await storageCreateSignedUrl(found.bucket, found.path, 3600);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    return res.json({ url, bucket: found.bucket });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

router.post("/melosa/movimentacoes", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });

    const parsedBody = melosaWebCreateSchema.safeParse(req.body);
    if (!parsedBody.success) return res.status(400).json({ error: parsedBody.error.flatten() });

    const service = createSupabaseServiceRole();
    const payload = parsedBody.data;

    const blocked = await denyIfNoBiWrite(service, req.userId, "bi_melosa", "add");
    if (blocked) return res.status(blocked.status).json({ error: blocked.error });

    try {
      await assertUserObraAccess(service, req.userId, payload.obra_codigo);
    } catch (e) {
      if (e instanceof ObraAccessError) return res.status(e.status).json({ error: e.message });
      throw e;
    }

    const ativoMelosa = payload.ativo_melosa_texto.trim().toUpperCase();
    const ativoEquipamento = payload.ativo_equipamento_texto.trim().toUpperCase();
    const quantidadeStr = String(payload.quantidade_litros);
    const operationId = randomUUID();

    const insertRowMelosa = {
      operation_id: operationId,
      usuario_id: req.userId,
      tipo: "RETIRADA_MELOSA",
      obra_codigo: payload.obra_codigo,
      data_hora: new Date(payload.data_hora).toISOString(),
      litros: payload.quantidade_litros,
      melosa_quantidade_abastecida: quantidadeStr,
      melosa_combustivel_tipo_retirada: payload.melosa_combustivel_tipo_retirada?.trim() || null,
      melosa_combustivel_tipo_registro: payload.melosa_combustivel_tipo_registro?.trim() || null,
      melosa_categoria: payload.melosa_categoria ?? null,
      melosa_horimetro_equipamento_abastecido_numero:
        payload.melosa_horimetro_equipamento_abastecido_numero?.trim() || null,
      melosa_motorista_equipamento_abastecido: payload.melosa_motorista_equipamento_abastecido?.trim() || null,
      melosa_operador_nome: payload.melosa_operador_nome?.trim() || null,
      melosa_lubrificado: payload.melosa_lubrificado === true ? true : null,
      ativo_melosa_texto: ativoMelosa,
      ativo_equipamento_texto: ativoEquipamento,
      tanque_numero: payload.tanque_numero ?? null,
      obs: payload.obs?.trim() || null,
    };

    const { error } = await service
      .from("melosa_movimentacoes")
      .insert(sanitizeMelosaRowForDb(insertRowMelosa as Record<string, unknown>));

    if (error) return res.status(400).json({ error: error.message });

    await logMovimentacaoAudit(service, {
      entity: "melosa",
      action: "insert",
      operationId,
      obraCodigo: payload.obra_codigo,
      actorUserId: req.userId,
      before: null,
      after: insertRowMelosa as Record<string, unknown>,
    });

    try {
      await vincularAbastecimentoAoCicloAberto(service, {
        operationId,
        ativoMelosa,
        litrosAbastecidos: payload.quantidade_litros,
      });
    } catch (cicloErr: unknown) {
      console.warn("[melosa_ciclo] vincular abastecimento (web):", cicloErr);
    }

    return res.json({ ok: true, operation_id: operationId });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

async function assertCanEditMelosaMov(
  service: ReturnType<typeof createSupabaseServiceRole>,
  userId: string,
  current: { usuario_id: string; obra_codigo?: number | null },
  action: "edit" | "delete" = "edit",
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const admin = await isAdmin(service, userId);
  if (admin) return { ok: true };

  const profile = await loadWebWriteProfile(service, userId);
  if (profile?.access_platform === "web") {
    if (!canWriteBiAction(profile, "bi_melosa", action)) {
      return { ok: false, status: 403, error: BI_WRITE_DENIED };
    }
    if (current.obra_codigo != null) {
      try {
        await assertUserObraAccess(service, userId, Number(current.obra_codigo));
        return { ok: true };
      } catch (e) {
        if (e instanceof ObraAccessError) return { ok: false, status: e.status, error: e.message };
        throw e;
      }
    }
    return { ok: true };
  }

  if (current.usuario_id === userId) return { ok: true };
  if (current.obra_codigo != null) {
    try {
      await assertUserObraAccess(service, userId, Number(current.obra_codigo));
      return { ok: true };
    } catch (e) {
      if (e instanceof ObraAccessError) return { ok: false, status: e.status, error: e.message };
      throw e;
    }
  }
  return { ok: false, status: 403, error: "Sem permissão para editar esta movimentação" };
}

async function assertCanMutateTanqueMov(
  service: ReturnType<typeof createSupabaseServiceRole>,
  userId: string,
  current: { usuario_id: string; obra_codigo?: number | null },
  action: "edit" | "delete",
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const admin = await isAdmin(service, userId);
  if (admin) return { ok: true };

  const profile = await loadWebWriteProfile(service, userId);
  if (profile?.access_platform === "web") {
    if (!canWriteBiAction(profile, "bi_tanque", action)) {
      return { ok: false, status: 403, error: BI_WRITE_DENIED };
    }
    if (current.obra_codigo != null) {
      try {
        await assertUserObraAccess(service, userId, Number(current.obra_codigo));
        return { ok: true };
      } catch (e) {
        if (e instanceof ObraAccessError) return { ok: false, status: e.status, error: e.message };
        throw e;
      }
    }
    return { ok: true };
  }

  if (current.usuario_id === userId) return { ok: true };
  return { ok: false, status: 403, error: `Sem permissão para ${action === "delete" ? "excluir" : "editar"} esta movimentação` };
}

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
      .select("*")
      .eq("operation_id", operationId)
      .maybeSingle();

    if (currentError) return res.status(400).json({ error: currentError.message });
    if (!current) return res.status(404).json({ error: "Movimentação não encontrada" });

    const canEdit = await assertCanEditMelosaMov(service, req.userId, current);
    if (!canEdit.ok) return res.status(canEdit.status).json({ error: canEdit.error });

    const updatePayload: Record<string, unknown> = { ...parsedBody.data };
    if (updatePayload.obra_codigo != null) {
      try {
        await assertUserObraAccess(service, req.userId, updatePayload.obra_codigo as number);
      } catch (e) {
        if (e instanceof ObraAccessError) return res.status(e.status).json({ error: e.message });
        throw e;
      }
    }
    if (updatePayload.data_hora != null) {
      updatePayload.data_hora = new Date(String(updatePayload.data_hora)).toISOString();
    }
    if (updatePayload.melosa_quantidade_abastecida !== undefined) {
      const litrosCalc = parseMedidorMelosaNumero(String(updatePayload.melosa_quantidade_abastecida ?? ""));
      if (litrosCalc != null && litrosCalc > 0) updatePayload.litros = litrosCalc;
    } else if (updatePayload.litros !== undefined && typeof updatePayload.litros === "number") {
      updatePayload.melosa_quantidade_abastecida = String(updatePayload.litros);
    }

    const { data: updated, error: updateError } = await service
      .from("melosa_movimentacoes")
      .update(sanitizeMelosaRowForDb(updatePayload))
      .eq("operation_id", operationId)
      .select("*")
      .maybeSingle();

    if (updateError) return res.status(400).json({ error: updateError.message });

    await logMovimentacaoAudit(service, {
      entity: "melosa",
      action: "update",
      operationId,
      obraCodigo: (updated?.obra_codigo as number | null) ?? (current.obra_codigo as number | null),
      actorUserId: req.userId,
      before: current as Record<string, unknown>,
      after: (updated as Record<string, unknown>) ?? null,
    });

    return res.json({ ok: true, operation_id: operationId });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

/** Completa fotos em branco (ou substitui) de um abastecimento Melosa pela web. */
router.post("/melosa/movimentacoes/:operationId/photos", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });
    const operationId = String(req.params.operationId ?? "");
    const parsedId = z.string().uuid().safeParse(operationId);
    if (!parsedId.success) return res.status(400).json({ error: "operationId inválido" });

    const parsedBody = melosaPhotoUploadSchema.safeParse(req.body);
    if (!parsedBody.success) return res.status(400).json({ error: parsedBody.error.flatten() });

    const service = createSupabaseServiceRole();
    const { data: current, error: currentError } = await service
      .from("melosa_movimentacoes")
      .select(
        "operation_id, usuario_id, obra_codigo, data_hora, ativo_melosa_texto, ativo_equipamento_texto, melosa_quantidade_abastecida_storage_path, melosa_horimetro_equipamento_abastecido_storage_path, melosa_equipamento_operador_storage_path, melosa_assinatura_operador_storage_path, melosa_assinatura_motorista_storage_path",
      )
      .eq("operation_id", operationId)
      .maybeSingle();

    if (currentError) return res.status(400).json({ error: currentError.message });
    if (!current) return res.status(404).json({ error: "Movimentação não encontrada" });

    const canEdit = await assertCanEditMelosaMov(service, req.userId, current);
    if (!canEdit.ok) return res.status(canEdit.status).json({ error: canEdit.error });

    const kind = parsedBody.data.kind as MelosaPhotoKind;
    const meta = MELOSA_PHOTO_KINDS[kind];
    let parsedImage: { bytes: Buffer; contentType: string; ext: string };
    try {
      parsedImage = parseImageBase64Payload(parsedBody.data.data_base64, parsedBody.data.content_type);
    } catch (e: unknown) {
      return res.status(400).json({ error: e instanceof Error ? e.message : "Imagem inválida" });
    }

    const storagePath = buildMonthOrganizedStoragePath({
      ativo:
        (current.ativo_equipamento_texto as string) ||
        (current.ativo_melosa_texto as string) ||
        null,
      dataHora: (current.data_hora as string) || new Date().toISOString(),
      kind,
      ext: parsedImage.ext,
      uniqueSuffix: operationId,
    });
    const bucket = meta.bucket();

    try {
      await storageUpload(bucket, storagePath, parsedImage.bytes, {
        contentType: parsedImage.contentType,
        upsert: true,
      });
    } catch (e: unknown) {
      return res.status(400).json({
        error: `Falha no upload: ${e instanceof Error ? e.message : String(e)}`,
      });
    }

    const { error: updateError } = await service
      .from("melosa_movimentacoes")
      .update(sanitizeMelosaRowForDb({ [meta.column]: storagePath }))
      .eq("operation_id", operationId);

    if (updateError) return res.status(400).json({ error: updateError.message });

    return res.json({
      ok: true,
      operation_id: operationId,
      kind,
      column: meta.column,
      storage_path: storagePath,
      bucket,
    });
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
      .select("*")
      .eq("operation_id", operationId)
      .maybeSingle();

    if (currentError) return res.status(400).json({ error: currentError.message });
    if (!current) return res.status(404).json({ error: "Movimentação não encontrada" });

    const canDelete = await assertCanEditMelosaMov(service, req.userId, current, "delete");
    if (!canDelete.ok) return res.status(canDelete.status).json({ error: canDelete.error });

    const { error: deleteError } = await service.from("melosa_movimentacoes").delete().eq("operation_id", operationId);
    if (deleteError) return res.status(400).json({ error: deleteError.message });

    await logMovimentacaoAudit(service, {
      entity: "melosa",
      action: "delete",
      operationId,
      obraCodigo: (current.obra_codigo as number | null) ?? null,
      actorUserId: req.userId,
      before: current as Record<string, unknown>,
      after: null,
    });

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
      .select("*")
      .eq("operation_id", operationId)
      .maybeSingle();

    if (currentError) return res.status(400).json({ error: currentError.message });
    if (!current) return res.status(404).json({ error: "Movimentação não encontrada" });

    const canEdit = await assertCanMutateTanqueMov(service, req.userId, current, "edit");
    if (!canEdit.ok) return res.status(canEdit.status).json({ error: canEdit.error });

    if (current.tipo !== "ENTRADA_TANQUE_OBRA" && current.tipo !== "RETIRADA_TANQUE") {
      return res.status(400).json({ error: "Esta rota edita apenas movimentações de tanque" });
    }

    const { data: updated, error: updateError } = await service
      .from("movimentacoes")
      .update(parsedBody.data as any)
      .eq("operation_id", operationId)
      .select("*")
      .maybeSingle();

    if (updateError) return res.status(400).json({ error: updateError.message });

    await logMovimentacaoAudit(service, {
      entity: "tanque",
      action: "update",
      operationId,
      obraCodigo: (updated?.obra_codigo as number | null) ?? (current.obra_codigo as number | null),
      actorUserId: req.userId,
      before: current as Record<string, unknown>,
      after: (updated as Record<string, unknown>) ?? null,
    });

    return res.json({ ok: true, operation_id: operationId });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

/** Completa fotos em branco (ou substitui) de movimentação de tanque pela web. */
router.post("/tanque/movimentacoes/:operationId/photos", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });
    const operationId = String(req.params.operationId ?? "");
    const parsedId = z.string().uuid().safeParse(operationId);
    if (!parsedId.success) return res.status(400).json({ error: "operationId inválido" });

    const parsedBody = tanquePhotoUploadSchema.safeParse(req.body);
    if (!parsedBody.success) return res.status(400).json({ error: parsedBody.error.flatten() });

    const service = createSupabaseServiceRole();
    const { data: current, error: currentError } = await service
      .from("movimentacoes")
      .select("operation_id, usuario_id, obra_codigo, tipo, data_hora, placa_texto, tanque_numero")
      .eq("operation_id", operationId)
      .maybeSingle();

    if (currentError) return res.status(400).json({ error: currentError.message });
    if (!current) return res.status(404).json({ error: "Movimentação não encontrada" });

    const tipo = String(current.tipo ?? "");
    if (tipo !== "ENTRADA_TANQUE_OBRA" && tipo !== "RETIRADA_TANQUE") {
      return res.status(400).json({ error: "Esta rota é apenas para movimentações de tanque" });
    }

    const canEdit = await assertCanMutateTanqueMov(service, req.userId, current, "edit");
    if (!canEdit.ok) return res.status(canEdit.status).json({ error: canEdit.error });

    const kind = parsedBody.data.kind as TanquePhotoKind;
    const meta = TANQUE_PHOTO_KINDS[kind];
    if (!(meta.tipos as readonly string[]).includes(tipo)) {
      return res.status(400).json({ error: `Foto "${kind}" não se aplica a ${tipo}` });
    }

    let parsedImage: { bytes: Buffer; contentType: string; ext: string };
    try {
      parsedImage = parseImageBase64Payload(parsedBody.data.data_base64, parsedBody.data.content_type);
    } catch (e: unknown) {
      return res.status(400).json({ error: e instanceof Error ? e.message : "Imagem inválida" });
    }

    const ativoLabel =
      String(current.placa_texto ?? "").trim() ||
      (current.tanque_numero != null ? `TANQUE-${current.tanque_numero}` : null);
    const storagePathUpload = buildMonthOrganizedStoragePath({
      ativo: ativoLabel,
      dataHora: (current.data_hora as string) || new Date().toISOString(),
      kind: kind.replace(/_/g, "-"),
      ext: parsedImage.ext,
      uniqueSuffix: operationId,
    });
    const bucket = meta.bucket();

    try {
      await storageUpload(bucket, storagePathUpload, parsedImage.bytes, {
        contentType: parsedImage.contentType,
        upsert: true,
      });
    } catch (e: unknown) {
      return res.status(400).json({
        error: `Falha no upload: ${e instanceof Error ? e.message : String(e)}`,
      });
    }

    const { error: updateError } = await service
      .from("movimentacoes")
      .update({ [meta.column]: storagePathUpload })
      .eq("operation_id", operationId);

    if (updateError) return res.status(400).json({ error: updateError.message });

    return res.json({
      ok: true,
      operation_id: operationId,
      kind,
      column: meta.column,
      storage_path: storagePathUpload,
      bucket,
    });
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
      .select("*")
      .eq("operation_id", operationId)
      .maybeSingle();

    if (currentError) return res.status(400).json({ error: currentError.message });
    if (!current) return res.status(404).json({ error: "Movimentação não encontrada" });

    const canDelete = await assertCanMutateTanqueMov(service, req.userId, current, "delete");
    if (!canDelete.ok) return res.status(canDelete.status).json({ error: canDelete.error });

    if (current.tipo !== "ENTRADA_TANQUE_OBRA" && current.tipo !== "RETIRADA_TANQUE") {
      return res.status(400).json({ error: "Esta rota exclui apenas movimentações de tanque" });
    }

    const { error: deleteError } = await service.from("movimentacoes").delete().eq("operation_id", operationId);
    if (deleteError) return res.status(400).json({ error: deleteError.message });

    await logMovimentacaoAudit(service, {
      entity: "tanque",
      action: "delete",
      operationId,
      obraCodigo: (current.obra_codigo as number | null) ?? null,
      actorUserId: req.userId,
      before: current as Record<string, unknown>,
      after: null,
    });

    return res.json({ ok: true, operation_id: operationId });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

// Entrada de combustível no tanque (registro manual pela web).
// Credita o saldo do tanque. Foto/assinaturas não são obrigatórias neste fluxo.
router.post("/tanque/movimentacoes/entrada", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });

    const parsedBody = tanqueEntradaCombustivelWebSchema.safeParse(req.body);
    if (!parsedBody.success) return res.status(400).json({ error: parsedBody.error.flatten() });

    const service = createSupabaseServiceRole();
    const payload = parsedBody.data;

    const blocked = await denyIfNoBiWrite(service, req.userId, "bi_tanque", "add");
    if (blocked) return res.status(blocked.status).json({ error: blocked.error });

    try {
      await assertUserObraAccess(service, req.userId, payload.obra_codigo);
    } catch (e) {
      if (e instanceof ObraAccessError) return res.status(e.status).json({ error: e.message });
      throw e;
    }

    const { data: tanqueCadastrado } = await service
      .from("equipamentos")
      .select("ativo")
      .eq("tipo", "TANQUE")
      .eq("obra_codigo", payload.obra_codigo)
      .eq("tanque_numero", payload.tanque_numero)
      .maybeSingle();
    if (!tanqueCadastrado) {
      return res.status(400).json({
        error: `Tanque ${payload.tanque_numero} não cadastrado para a obra ${payload.obra_codigo}.`,
      });
    }

    const placa = payload.placa_texto?.trim().toUpperCase() || null;
    const fornecedor = payload.fornecedor_texto?.trim() || null;
    const operationId = randomUUID();

    const entradaRow = {
      operation_id: operationId,
      usuario_id: req.userId,
      tipo: "ENTRADA_TANQUE_OBRA",
      obra_codigo: payload.obra_codigo,
      data_hora: new Date(payload.data_hora).toISOString(),
      litros: payload.litros,
      combustivel_tipo: payload.combustivel_tipo.trim(),
      tanque_numero: payload.tanque_numero,
      nota_numero: payload.nota_numero?.trim() || null,
      valor_unitario: payload.valor_unitario ?? null,
      placa_texto: placa,
      placa_caminhao: placa,
      fornecedor_texto: fornecedor,
      nota_storage_path: null,
      tanque_assinatura_operador_storage_path: null,
      tanque_assinatura_melosa_storage_path: null,
      obs: payload.obs?.trim() || null,
    };

    const { error } = await service.from("movimentacoes").insert(entradaRow);

    if (error) return res.status(400).json({ error: error.message });

    await logMovimentacaoAudit(service, {
      entity: "tanque",
      action: "insert",
      operationId,
      obraCodigo: payload.obra_codigo,
      actorUserId: req.userId,
      before: null,
      after: entradaRow as Record<string, unknown>,
    });

    return res.json({ ok: true, operation_id: operationId });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

// Retirada do tanque DIRETO para um equipamento (registro manual pela web).
// Abate o saldo do tanque e NÃO cria ciclo de melosa.
router.post("/tanque/movimentacoes", requireAuth, async (req: AuthedRequest, res) => {
  try {
    if (!req.userId) return res.status(401).json({ error: "Unauthorized" });

    const parsedBody = tanqueRetiradaEquipamentoWebSchema.safeParse(req.body);
    if (!parsedBody.success) return res.status(400).json({ error: parsedBody.error.flatten() });

    const service = createSupabaseServiceRole();
    const payload = parsedBody.data;

    const blocked = await denyIfNoBiWrite(service, req.userId, "bi_tanque", "add");
    if (blocked) return res.status(blocked.status).json({ error: blocked.error });

    try {
      await assertUserObraAccess(service, req.userId, payload.obra_codigo);
    } catch (e) {
      if (e instanceof ObraAccessError) return res.status(e.status).json({ error: e.message });
      throw e;
    }

    const { data: tanqueCadastrado } = await service
      .from("equipamentos")
      .select("ativo")
      .eq("tipo", "TANQUE")
      .eq("obra_codigo", payload.obra_codigo)
      .eq("tanque_numero", payload.tanque_numero)
      .maybeSingle();
    if (!tanqueCadastrado) {
      return res.status(400).json({
        error: `Tanque ${payload.tanque_numero} não cadastrado para a obra ${payload.obra_codigo}.`,
      });
    }

    // Retirada direta: abate saldo do tanque sem ciclo de melosa.
    const patrimonio = payload.ativo_equipamento_texto.trim().toUpperCase();
    if (!patrimonio) return res.status(400).json({ error: "Informe o patrimônio do equipamento." });

    const operationId = randomUUID();
    const quantidadeStr = String(payload.quantidade_litros);

    const retiradaRow = {
      operation_id: operationId,
      usuario_id: req.userId,
      tipo: "RETIRADA_TANQUE",
      obra_codigo: payload.obra_codigo,
      data_hora: new Date(payload.data_hora).toISOString(),
      litros: payload.quantidade_litros,
      combustivel_tipo: payload.combustivel_tipo?.trim() || null,
      tanque_numero: payload.tanque_numero,
      tanque_quantidade_abastecida: quantidadeStr,
      placa_texto: patrimonio,
      fornecedor_texto: patrimonio,
      obs: payload.obs?.trim() || null,
    };

    const { error } = await service.from("movimentacoes").insert(retiradaRow);

    if (error) return res.status(400).json({ error: error.message });

    await logMovimentacaoAudit(service, {
      entity: "tanque",
      action: "insert",
      operationId,
      obraCodigo: payload.obra_codigo,
      actorUserId: req.userId,
      before: null,
      after: retiradaRow as Record<string, unknown>,
    });

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

    try {
      await assertUserObraAccess(service, req.userId, payload.obra_codigo);
    } catch (e) {
      if (e instanceof ObraAccessError) return res.status(e.status).json({ error: e.message });
      throw e;
    }

    const isTanqueTipo = payload.tipo === "ENTRADA_TANQUE_OBRA" || payload.tipo === "RETIRADA_TANQUE";
    if (melosaDriver && isTanqueTipo) {
      return res.status(403).json({ error: "Perfil Melosa: somente movimentações da Melosa são permitidas." });
    }

    const placaNorm =
      (payload.ativo_melosa_texto?.trim() || payload.placa_texto?.trim() || "").trim() || null;
    const fornecedorNorm =
      (payload.ativo_equipamento_texto?.trim() || payload.fornecedor_texto?.trim() || "").trim() || null;
    const equipamentoEmpresaNorm = payload.ativo_equipamento_empresa
      ? normalizeEquipamentoEmpresa(payload.ativo_equipamento_empresa)
      : null;
    const tanqueNum = payload.tanque_numero;

    const needsVeiculoMeta =
      payload.tipo === "ENTRADA_TANQUE_OBRA" ||
      payload.tipo === "RETIRADA_TANQUE" ||
      payload.tipo === "RETIRADA_MELOSA";
    if (needsVeiculoMeta) {
      if (!placaNorm) {
        return res.status(400).json({ error: "placa_texto é obrigatório" });
      }
      if (payload.tipo !== "RETIRADA_TANQUE" && !fornecedorNorm) {
        return res.status(400).json({ error: "fornecedor_texto é obrigatório" });
      }
      if (payload.tipo === "RETIRADA_MELOSA") {
        if (tanqueNum !== 1 && tanqueNum !== 2) {
          return res.status(400).json({ error: "tanque_numero é obrigatório e deve ser 1 ou 2" });
        }
      } else if (!tanqueNum || !Number.isInteger(tanqueNum) || tanqueNum <= 0) {
        return res.status(400).json({ error: "tanque_numero é obrigatório" });
      } else {
        const { data: tanqueCadastrado } = await service
          .from("equipamentos")
          .select("ativo")
          .eq("tipo", "TANQUE")
          .eq("obra_codigo", payload.obra_codigo)
          .eq("tanque_numero", tanqueNum)
          .maybeSingle();
        if (!tanqueCadastrado) {
          return res.status(400).json({
            error: `Tanque ${tanqueNum} não cadastrado para a obra ${payload.obra_codigo}.`,
          });
        }
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

      const noteExists = await storageExists(envValidated.NOTAS_BUCKET, notaStoragePath);
      if (!noteExists) {
        return res.status(400).json({ error: "Arquivo da nota não encontrado no Storage" });
      }

      if (!payload.tanque_assinatura_operador_storage_path?.trim()) {
        return res.status(400).json({ error: "tanque_assinatura_operador_storage_path é obrigatório" });
      }
      if (!payload.tanque_assinatura_melosa_storage_path?.trim()) {
        return res.status(400).json({ error: "tanque_assinatura_melosa_storage_path é obrigatório" });
      }
      const tanqueAssinaturaOperadorOk = await storageObjectExists(
        service,
        envValidated.MELOSA_ASSINATURAS_BUCKET,
        payload.tanque_assinatura_operador_storage_path,
      );
      if (!tanqueAssinaturaOperadorOk) {
        return res.status(400).json({ error: "Assinatura do operador do tanque não encontrada no Storage" });
      }
      const tanqueAssinaturaEntregaOk = await storageObjectExists(
        service,
        envValidated.MELOSA_ASSINATURAS_BUCKET,
        payload.tanque_assinatura_melosa_storage_path,
      );
      if (!tanqueAssinaturaEntregaOk) {
        return res.status(400).json({ error: "Assinatura do responsável pela entrega não encontrada no Storage" });
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
      if (!payload.tanque_quantidade_abastecida?.trim()) {
        return res.status(400).json({ error: "tanque_quantidade_abastecida é obrigatório" });
      }
      const litrosTanqueCalculados = parseMedidorMelosaNumero(payload.tanque_quantidade_abastecida);
      if (litrosTanqueCalculados == null || litrosTanqueCalculados <= 0) {
        return res.status(400).json({ error: "Quantidade abastecida inválida (informe litros maior que zero)" });
      }
      if (!payload.tanque_quantidade_abastecida_storage_path?.trim()) {
        return res.status(400).json({ error: "tanque_quantidade_abastecida_storage_path é obrigatório" });
      }

      const retiradaHorimetroFotoPath = payload.retirada_horimetro_foto_storage_path?.trim();
      if (retiradaHorimetroFotoPath) {
        const horimetroFotoExists = await storageExists(
          envValidated.RETIRADA_HORIMETRO_BUCKET,
          retiradaHorimetroFotoPath,
        );
        if (!horimetroFotoExists) {
          return res.status(400).json({ error: "Foto do horímetro não encontrada no Storage" });
        }
      }

      const lacreTanqueExists = await storageExists(
        envValidated.LACRE_TANQUE_BUCKET,
        payload.lacre_tanque_storage_path,
      );
      if (!lacreTanqueExists) {
        return res.status(400).json({ error: "Arquivo do lacre do tanque não encontrado no Storage" });
      }

      const lacreMelosaExists = await storageExists(
        envValidated.LACRE_MELOSA_BUCKET,
        payload.lacre_melosa_storage_path,
      );
      if (!lacreMelosaExists) {
        return res.status(400).json({ error: "Arquivo do lacre da melosa não encontrado no Storage" });
      }

      const quantidadeTanqueFotoOk = await storageObjectExists(
        service,
        envValidated.FOTO_QUANTIDADE_ABASTECIDA_BUCKET,
        payload.tanque_quantidade_abastecida_storage_path,
      );
      if (!quantidadeTanqueFotoOk) {
        return res.status(400).json({
          error: "Foto do medidor de abastecimento não encontrada no Storage",
          bucket: envValidated.FOTO_QUANTIDADE_ABASTECIDA_BUCKET,
          path: payload.tanque_quantidade_abastecida_storage_path,
        });
      }

      if (!payload.tanque_assinatura_operador_storage_path?.trim()) {
        return res.status(400).json({ error: "tanque_assinatura_operador_storage_path é obrigatório" });
      }
      if (!payload.tanque_assinatura_melosa_storage_path?.trim()) {
        return res.status(400).json({ error: "tanque_assinatura_melosa_storage_path é obrigatório" });
      }
      const tanqueAssinaturaOperadorOk = await storageObjectExists(
        service,
        envValidated.MELOSA_ASSINATURAS_BUCKET,
        payload.tanque_assinatura_operador_storage_path,
      );
      if (!tanqueAssinaturaOperadorOk) {
        return res.status(400).json({ error: "Assinatura do operador do tanque não encontrada no Storage" });
      }
      const tanqueAssinaturaMelosaOk = await storageObjectExists(
        service,
        envValidated.MELOSA_ASSINATURAS_BUCKET,
        payload.tanque_assinatura_melosa_storage_path,
      );
      if (!tanqueAssinaturaMelosaOk) {
        return res.status(400).json({ error: "Assinatura do responsável pela melosa não encontrada no Storage" });
      }
    }

    if (payload.tipo === "RETIRADA_MELOSA") {
      const categoria = payload.melosa_categoria ?? null;
      if (categoria != null && categoria !== "ESTACIONARIA" && categoria !== "MOVEL") {
        return res.status(400).json({ error: "melosa_categoria inválido (use ESTACIONARIA ou MOVEL)" });
      }
      const isUsina = Number(payload.obra_codigo) === 9020;
      const encerranteInicial = payload.melosa_encerrante_inicial_numero?.trim() ?? "";
      const encerranteFinal = payload.melosa_encerrante_final_numero?.trim() ?? "";
      if (isUsina) {
        if (!encerranteInicial) {
          return res.status(400).json({ error: "melosa_encerrante_inicial_numero é obrigatório na obra Usina" });
        }
        if (!encerranteFinal) {
          return res.status(400).json({ error: "melosa_encerrante_final_numero é obrigatório na obra Usina" });
        }
        const inicialNum = parseMedidorMelosaNumero(encerranteInicial);
        const finalNum = parseMedidorMelosaNumero(encerranteFinal);
        if (inicialNum == null || finalNum == null) {
          return res.status(400).json({ error: "Encerrante inicial/final inválido" });
        }
        if (finalNum < inicialNum) {
          return res.status(400).json({ error: "Encerrante final deve ser maior ou igual ao inicial" });
        }
      } else if (encerranteInicial || encerranteFinal) {
        return res.status(400).json({
          error: "Encerrante inicial/final só é permitido na obra Usina (9020)",
        });
      }
      if (!payload.melosa_quantidade_abastecida?.trim()) {
        return res.status(400).json({ error: "melosa_quantidade_abastecida é obrigatório" });
      }
      const litrosMelosaCalculados = parseMedidorMelosaNumero(payload.melosa_quantidade_abastecida);
      if (litrosMelosaCalculados == null || litrosMelosaCalculados <= 0) {
        return res.status(400).json({ error: "Quantidade abastecida inválida (informe litros maior que zero)" });
      }
      if (!payload.melosa_quantidade_abastecida_storage_path?.trim()) {
        return res.status(400).json({ error: "melosa_quantidade_abastecida_storage_path é obrigatório" });
      }
      const quantidadeFotoOk = await storageObjectExists(
        service,
        envValidated.FOTO_QUANTIDADE_ABASTECIDA_BUCKET,
        payload.melosa_quantidade_abastecida_storage_path,
      );
      if (!quantidadeFotoOk) {
        return res.status(400).json({
          error: "Foto da quantidade abastecida não encontrada no Storage",
          bucket: envValidated.FOTO_QUANTIDADE_ABASTECIDA_BUCKET,
          path: payload.melosa_quantidade_abastecida_storage_path,
        });
      }

      const melosaHorimetroFotoPath = payload.melosa_horimetro_equipamento_abastecido_storage_path?.trim();
      if (melosaHorimetroFotoPath) {
        const horimetroOk = await storageObjectExists(
          service,
          envValidated.MELOSA_HORIMETRO_EQUIPAMENTO_ABASTECIDO_BUCKET,
          melosaHorimetroFotoPath
        );
        if (!horimetroOk) {
          return res.status(400).json({ error: "Foto do hodômetro do equipamento abastecido não encontrada no Storage" });
        }
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

      if (!payload.melosa_assinatura_operador_storage_path?.trim()) {
        return res.status(400).json({ error: "melosa_assinatura_operador_storage_path é obrigatório" });
      }
      if (!payload.melosa_assinatura_motorista_storage_path?.trim()) {
        return res.status(400).json({ error: "melosa_assinatura_motorista_storage_path é obrigatório" });
      }
      const assinaturaOperadorOk = await storageObjectExists(
        service,
        envValidated.MELOSA_ASSINATURAS_BUCKET,
        payload.melosa_assinatura_operador_storage_path,
      );
      if (!assinaturaOperadorOk) {
        return res.status(400).json({ error: "Assinatura do operador da melosa não encontrada no Storage" });
      }
      const assinaturaMotoristaOk = await storageObjectExists(
        service,
        envValidated.MELOSA_ASSINATURAS_BUCKET,
        payload.melosa_assinatura_motorista_storage_path,
      );
      if (!assinaturaMotoristaOk) {
        return res.status(400).json({ error: "Assinatura do motorista não encontrada no Storage" });
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
        melosa_quantidade_abastecida: payload.melosa_quantidade_abastecida ?? null,
        melosa_quantidade_abastecida_storage_path: payload.melosa_quantidade_abastecida_storage_path ?? null,
        melosa_encerrante_inicial_numero: isUsina ? encerranteInicial || null : null,
        melosa_encerrante_final_numero: isUsina ? encerranteFinal || null : null,
        melosa_lacre_numero: lacreNumero || null,
        melosa_lacre_storage_path: lacrePath || null,
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
        ativo_equipamento_empresa: equipamentoEmpresaNorm,
        ativo_equipamento_nome: payload.ativo_equipamento_nome?.trim() || null,
        melosa_operador_nome: payload.melosa_operador_nome?.trim() || null,
        melosa_assinatura_operador_storage_path: payload.melosa_assinatura_operador_storage_path ?? null,
        melosa_assinatura_motorista_storage_path: payload.melosa_assinatura_motorista_storage_path ?? null,
        melosa_lubrificado: payload.melosa_lubrificado === true ? true : null,
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

      await logMovimentacaoAudit(service, {
        entity: "melosa",
        action: "insert",
        operationId: payload.operation_id,
        obraCodigo: payload.obra_codigo,
        actorUserId: req.userId,
        before: null,
        after: insertRowMelosa as Record<string, unknown>,
      });

      try {
        await vincularAbastecimentoAoCicloAberto(service, {
          operationId: payload.operation_id,
          ativoMelosa: placaNorm ?? "",
          litrosAbastecidos: litrosMelosaCalculados,
        });
      } catch (cicloErr: unknown) {
        console.warn("[melosa_ciclo] vincular abastecimento:", cicloErr);
      }

      return res.json({
        ok: true,
        operation_id: payload.operation_id,
      });
    }

    const placaCaminhaoRow =
      payload.placa_caminhao?.trim() ||
      (isTanqueTipo && placaNorm ? placaNorm : null) ||
      null;

    let litrosGravados = payload.litros;
    if (payload.tipo === "RETIRADA_TANQUE") {
      const litrosQuantidade = parseMedidorMelosaNumero(payload.tanque_quantidade_abastecida);
      if (litrosQuantidade != null && litrosQuantidade > 0) litrosGravados = litrosQuantidade;
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
      tanque_quantidade_abastecida: payload.tanque_quantidade_abastecida ?? null,
      tanque_quantidade_abastecida_storage_path: payload.tanque_quantidade_abastecida_storage_path ?? null,
      tanque_operador_nome: isTanqueTipo ? payload.tanque_operador_nome ?? null : null,
      tanque_assinatura_operador_storage_path:
        isTanqueTipo ? payload.tanque_assinatura_operador_storage_path ?? null : null,
      tanque_assinatura_melosa_storage_path:
        isTanqueTipo ? payload.tanque_assinatura_melosa_storage_path ?? null : null,
      retirada_horimetro_foto_storage_path: payload.retirada_horimetro_foto_storage_path ?? null,

      placa_texto: needsVeiculoMeta ? placaNorm : null,
      fornecedor_texto:
        payload.tipo === "RETIRADA_TANQUE" ? null : needsVeiculoMeta ? fornecedorNorm : null,
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

    await logMovimentacaoAudit(service, {
      entity: "tanque",
      action: "insert",
      operationId: payload.operation_id,
      obraCodigo: payload.obra_codigo,
      actorUserId: req.userId,
      before: null,
      after: insertRow as Record<string, unknown>,
    });

    if (payload.tipo === "RETIRADA_TANQUE" && placaNorm) {
      const dataHoraIso = insertRow.data_hora as string;
      const ciclo = await criarCicloRetiradaTanque(service, {
        operationId: payload.operation_id,
        ativoMelosa: placaNorm,
        obraCodigo: payload.obra_codigo,
        dataHora: dataHoraIso,
        litrosRetirada: litrosGravados,
      });
      return res.json({
        ok: true,
        operation_id: payload.operation_id,
        ciclo_numero: ciclo.ciclo_numero,
        ciclo_anterior_numero: ciclo.ciclo_anterior_numero,
        ciclo_status: ciclo.status,
        volume_excedente: ciclo.volume_excedente,
        litros_sobra_anterior: ciclo.litros_sobra_anterior,
      });
    }

    return res.json({ ok: true, operation_id: payload.operation_id });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Unknown error" });
  }
});

export default router;

