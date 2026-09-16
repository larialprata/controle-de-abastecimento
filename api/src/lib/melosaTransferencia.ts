import { createHash, randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  criarCicloRetiradaTanque,
  excluirMelosaCiclo,
  recalcularLitrosAbastecidosCiclo,
  vincularAbastecimentoAoCicloAberto,
  type MelosaCicloRow,
} from "./melosaCiclo";

export const TRANSFERENCIA_MELOSA_OBS_PREFIX = "[TRANSFERENCIA_MELOSA]";

function normalizeAtivo(v: string): string {
  return v.trim().toUpperCase();
}

function toNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v.trim().replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * UUID determinístico do ciclo de entrada na melosa destino.
 * Garante idempotência: retry/sync do mesmo operation_id de saída não cria 2º ciclo.
 */
export function transferDestinoOperationId(saidaOperationId: string): string {
  const digest = createHash("sha256")
    .update(`transfer-destino:${String(saidaOperationId).trim().toLowerCase()}`)
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isTransferenciaMelosaObs(obs: string | null | undefined): boolean {
  return String(obs ?? "")
    .trim()
    .toUpperCase()
    .startsWith(TRANSFERENCIA_MELOSA_OBS_PREFIX);
}

export function buildTransferenciaObs(origem: string, destino: string, extra?: string | null): string {
  const base = `${TRANSFERENCIA_MELOSA_OBS_PREFIX} ${normalizeAtivo(origem)} → ${normalizeAtivo(destino)}`;
  const more = String(extra ?? "").trim();
  return more ? `${base} | ${more}` : base;
}

export type TransferenciaMelosaParams = {
  usuarioId: string;
  obraCodigo: number;
  dataHora: string;
  ativoOrigem: string;
  ativoDestino: string;
  litros: number;
  combustivelTipo?: string | null;
  obs?: string | null;
};

export type TransferenciaMelosaResultado = {
  saida_operation_id: string;
  entrada_operation_id: string;
  ciclo: MelosaCicloRow;
};

async function assertAtivoEhMelosa(service: SupabaseClient, ativo: string): Promise<void> {
  const key = normalizeAtivo(ativo);
  const { data } = await service.from("equipamentos").select("ativo, tipo").eq("tipo", "MELOSA");
  const found = (data ?? []).some((r) => normalizeAtivo(String(r.ativo ?? "")) === key);
  if (!found) {
    throw new Error(`Ativo ${key} não está cadastrado como melosa.`);
  }
}

async function findCicloDestinoTransferencia(
  service: SupabaseClient,
  params: {
    saidaOperationId: string;
    ativoDestino: string;
    dataHora: string | null;
    litros: number;
  },
): Promise<MelosaCicloRow | null> {
  const destinoOpId = transferDestinoOperationId(params.saidaOperationId);
  const { data: byOp } = await service
    .from("melosa_ciclos")
    .select("*")
    .eq("retirada_operation_id", destinoOpId)
    .maybeSingle();
  if (byOp) return byOp as MelosaCicloRow;

  // Fallback p/ transferências antigas (entrada com UUID aleatório).
  const destino = normalizeAtivo(params.ativoDestino);
  const dataHora = params.dataHora ? String(params.dataHora) : "";
  if (!destino || !dataHora || !(params.litros > 0)) return null;

  const { data: candidatos } = await service
    .from("melosa_ciclos")
    .select("*")
    .ilike("ativo_melosa_texto", destino)
    .eq("data_hora", dataHora)
    .order("ciclo_numero", { ascending: false })
    .limit(10);

  const match = (candidatos ?? []).find((c) => Math.abs(toNum(c.litros_retirada) - params.litros) < 0.05);
  return (match as MelosaCicloRow | undefined) ?? null;
}

/**
 * Ao excluir um transbordo: remove o ciclo de entrada na melosa destino.
 * O combustível deixa de constar no destino; após apagar a movimentação de saída,
 * o saldo da origem sobe de novo (abastecimento removido + recalculo do ciclo).
 */
export async function reverterTransferenciaMelosaAoExcluir(
  service: SupabaseClient,
  mov: {
    operation_id: string;
    obs?: string | null;
    ativo_melosa_texto?: string | null;
    ativo_equipamento_texto?: string | null;
    litros?: number | null;
    data_hora?: string | null;
  },
): Promise<{ cicloDestinoRemovido: boolean }> {
  const result = { cicloDestinoRemovido: false };
  if (!isTransferenciaMelosaObs(mov.obs)) return result;

  const destino = normalizeAtivo(String(mov.ativo_equipamento_texto ?? ""));
  const litros = toNum(mov.litros);
  const cicloDestino = await findCicloDestinoTransferencia(service, {
    saidaOperationId: mov.operation_id,
    ativoDestino: destino,
    dataHora: mov.data_hora ? String(mov.data_hora) : null,
    litros,
  });

  if (cicloDestino?.id) {
    await excluirMelosaCiclo(service, cicloDestino.id);
    result.cicloDestinoRemovido = true;
  }

  return result;
}

/** Após excluir qualquer RETIRADA_MELOSA, recalcula o ciclo da origem (se houver). */
export async function recalcularCicloOrigemAposExcluirMovimentacao(
  service: SupabaseClient,
  cicloId: string | null | undefined,
): Promise<boolean> {
  const id = String(cicloId ?? "").trim();
  if (!id) return false;
  await recalcularLitrosAbastecidosCiclo(service, id);
  return true;
}

/** Saída da origem (abastecimento no ciclo) + enchimento da destino (novo ciclo), sem mexer no tanque da obra. */
export async function registrarTransferenciaMelosa(
  service: SupabaseClient,
  params: TransferenciaMelosaParams,
): Promise<TransferenciaMelosaResultado> {
  const origem = normalizeAtivo(params.ativoOrigem);
  const destino = normalizeAtivo(params.ativoDestino);
  if (!origem || !destino) throw new Error("Informe origem e destino da transferência.");
  if (origem === destino) throw new Error("Origem e destino devem ser melosas diferentes.");
  if (!(params.litros > 0)) throw new Error("Litros deve ser maior que zero.");

  await assertAtivoEhMelosa(service, origem);
  await assertAtivoEhMelosa(service, destino);

  const dataHoraIso = new Date(params.dataHora).toISOString();
  if (Number.isNaN(Date.parse(dataHoraIso))) throw new Error("Data/hora inválida.");

  const saidaOperationId = randomUUID();
  const entradaOperationId = transferDestinoOperationId(saidaOperationId);
  const obs = buildTransferenciaObs(origem, destino, params.obs);
  const combustivel = params.combustivelTipo?.trim() || "DIESEL_S10";
  const litrosStr = String(params.litros);

  const insertSaida = {
    operation_id: saidaOperationId,
    usuario_id: params.usuarioId,
    tipo: "RETIRADA_MELOSA",
    obra_codigo: params.obraCodigo,
    data_hora: dataHoraIso,
    litros: params.litros,
    melosa_quantidade_abastecida: litrosStr,
    melosa_combustivel_tipo_retirada: combustivel,
    ativo_melosa_texto: origem,
    ativo_equipamento_texto: destino,
    obs,
  };

  const { error: saidaErr } = await service.from("melosa_movimentacoes").insert(insertSaida);
  if (saidaErr) throw new Error(saidaErr.message);

  try {
    await vincularAbastecimentoAoCicloAberto(service, {
      operationId: saidaOperationId,
      ativoMelosa: origem,
      litrosAbastecidos: params.litros,
    });
  } catch (cicloErr: unknown) {
    console.warn("[melosa_transferencia] vincular saída ao ciclo origem:", cicloErr);
  }

  const ciclo = await criarCicloRetiradaTanque(service, {
    operationId: entradaOperationId,
    ativoMelosa: destino,
    obraCodigo: params.obraCodigo,
    dataHora: dataHoraIso,
    litrosRetirada: params.litros,
  });

  return {
    saida_operation_id: saidaOperationId,
    entrada_operation_id: entradaOperationId,
    ciclo,
  };
}
