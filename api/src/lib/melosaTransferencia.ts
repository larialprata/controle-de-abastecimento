import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  criarCicloRetiradaTanque,
  vincularAbastecimentoAoCicloAberto,
  type MelosaCicloRow,
} from "./melosaCiclo";

export const TRANSFERENCIA_MELOSA_OBS_PREFIX = "[TRANSFERENCIA_MELOSA]";

function normalizeAtivo(v: string): string {
  return v.trim().toUpperCase();
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
  const entradaOperationId = randomUUID();
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
