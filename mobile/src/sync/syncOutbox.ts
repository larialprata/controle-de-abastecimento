import { apiPost } from "../lib/api";
import { getOutboxPending, deleteOutbox } from "../db/sqlite";
import type { MovimentacaoPayload } from "../types/movimentacao";

export async function syncOutbox(token: string) {
  const pending = getOutboxPending();
  if (pending.length === 0) {
    return { synced: 0, total: 0, failed: [] as string[], medidorDesvios: [] as MedidorDesvioSync[] };
  }

  let synced = 0;
  const failed: string[] = [];
  const medidorDesvios: MedidorDesvioSync[] = [];

  for (const row of pending) {
    const payload = JSON.parse(row.payload_json) as MovimentacaoPayload;
    payload.operation_id = row.operation_id;
    if (payload.tipo === "RETIRADA_MELOSA") {
      const horimetroNumero = String(payload.melosa_horimetro_equipamento_abastecido_numero ?? "").trim();
      const horimetroPath = String(payload.melosa_horimetro_equipamento_abastecido_storage_path ?? "").trim();
      if (!horimetroNumero && !horimetroPath) {
        payload.melosa_horimetro_equipamento_abastecido_numero = null;
        payload.melosa_horimetro_equipamento_abastecido_storage_path = null;
      }
    }

    try {
      const resp = await apiPost<{
        medidor_continuidade?: {
          status?: string;
          medidor_esperado?: number | null;
          medidor_informado?: number;
          medidor_desvio_litros?: number;
        } | null;
      }>("/v1/movimentacoes", token, payload, {
        operation_id: row.operation_id,
        tipo: payload.tipo,
      });
      const cont = resp?.medidor_continuidade;
      if (cont?.status === "desvio" && cont.medidor_desvio_litros != null) {
        medidorDesvios.push({
          desvio_litros: cont.medidor_desvio_litros,
          medidor_esperado: cont.medidor_esperado ?? null,
          medidor_informado: cont.medidor_informado ?? 0,
          ativo_melosa: payload.placa_texto ?? "",
        });
      }
      deleteOutbox(row.operation_id);
      synced += 1;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      failed.push(msg);
    }
  }

  if (failed.length > 0 && synced === 0) {
    throw new Error(failed[0]);
  }

  return { synced, total: pending.length, failed, medidorDesvios };
}

export type MedidorDesvioSync = {
  ativo_melosa: string;
  medidor_esperado: number | null;
  medidor_informado: number;
  desvio_litros: number;
};

