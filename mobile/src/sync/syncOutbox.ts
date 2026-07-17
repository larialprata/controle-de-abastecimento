import { apiPost } from "../lib/api";
import { deletePendingMedia, getOutboxPending, deleteOutbox, getPendingMedia } from "../db/sqlite";
import { readImageUriAsArrayBuffer } from "../lib/readImageUri";
import { supabase } from "../lib/supabase";
import type { MovimentacaoPayload } from "../types/movimentacao";

const LEGACY_MELOSA_KEYS = [
  "melosa_medidor_acumulado_inicial_numero",
  "melosa_medidor_acumulado_inicial_storage_path",
  "melosa_medidor_acumulado_final_numero",
  "melosa_medidor_acumulado_final_storage_path",
  "medidor_final_anterior",
  "medidor_desvio_litros",
  "medidor_continuidade_status",
] as const;

function parseLitrosTexto(value: string | null | undefined): number | null {
  const raw = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Remove campos legados e garante payload no formato quantidade abastecida. */
function normalizeMelosaPayload(payload: MovimentacaoPayload): MovimentacaoPayload {
  const raw = { ...payload } as MovimentacaoPayload & Record<string, unknown>;

  let quantidade = String(raw.melosa_quantidade_abastecida ?? "").trim();
  let quantidadePath = String(raw.melosa_quantidade_abastecida_storage_path ?? "").trim();

  if (!quantidade) {
    const inicial = parseLitrosTexto(String(raw.melosa_medidor_acumulado_inicial_numero ?? ""));
    const final = parseLitrosTexto(String(raw.melosa_medidor_acumulado_final_numero ?? ""));
    if (inicial != null && final != null && final > inicial) {
      quantidade = String(final - inicial);
    }
  }

  if (!quantidadePath) {
    quantidadePath =
      String(raw.melosa_medidor_acumulado_inicial_storage_path ?? "").trim() ||
      String(raw.melosa_medidor_acumulado_final_storage_path ?? "").trim();
  }

  for (const key of LEGACY_MELOSA_KEYS) {
    delete raw[key];
  }

  raw.melosa_quantidade_abastecida = quantidade || raw.melosa_quantidade_abastecida || null;
  raw.melosa_quantidade_abastecida_storage_path = quantidadePath || raw.melosa_quantidade_abastecida_storage_path || null;

  if (raw.litros == null || raw.litros <= 0) {
    const litros = parseLitrosTexto(quantidade);
    if (litros != null && litros > 0) raw.litros = litros;
  }

  return raw;
}

function explainSyncError(message: string): string {
  if (message.includes("melosa_medidor_acumulado_inicial_numero")) {
    return (
      "A API do servidor ainda está na versão antiga (medidor acumulado). " +
      "Atualize o backend no servidor para a versão com quantidade abastecida e rode a migration " +
      "migration_melosa_quantidade_abastecida.sql no Supabase."
    );
  }
  return message;
}

async function uploadPendingMediaForOperation(operationId: string): Promise<void> {
  const rows = getPendingMedia(operationId);
  if (rows.length === 0) return;

  for (const row of rows) {
    const { arrayBuffer, contentType } = await readImageUriAsArrayBuffer(row.local_uri);
    const { error } = await supabase.storage.from(row.bucket).upload(row.storage_path, arrayBuffer, {
      contentType: contentType || row.content_type,
      upsert: true,
    });
    if (error) {
      const msg = String(error.message ?? error);
      const alreadyExists =
        msg.toLowerCase().includes("already exists") || msg.toLowerCase().includes("duplicate");
      if (!alreadyExists) {
        throw new Error(`Falha ao enviar foto (${row.storage_path}): ${msg}`);
      }
    }
  }

  deletePendingMedia(operationId);
}

export async function syncOutbox(token: string) {
  const pending = getOutboxPending();
  if (pending.length === 0) {
    return { synced: 0, total: 0, failed: [] as string[], medidorDesvios: [] as MedidorDesvioSync[] };
  }

  let synced = 0;
  const failed: string[] = [];
  const medidorDesvios: MedidorDesvioSync[] = [];

  for (const row of pending) {
    let payload = JSON.parse(row.payload_json) as MovimentacaoPayload;
    payload.operation_id = row.operation_id;
    if (payload.tipo === "RETIRADA_MELOSA") {
      payload = normalizeMelosaPayload(payload);
      const horimetroNumero = String(payload.melosa_horimetro_equipamento_abastecido_numero ?? "").trim();
      const horimetroPath = String(payload.melosa_horimetro_equipamento_abastecido_storage_path ?? "").trim();
      if (!horimetroNumero && !horimetroPath) {
        payload.melosa_horimetro_equipamento_abastecido_numero = null;
        payload.melosa_horimetro_equipamento_abastecido_storage_path = null;
      }
    }

    try {
      // Sempre sobe com a data/hora gravada no celular no momento do save offline.
      if (!payload.data_hora) {
        payload.data_hora = new Date().toISOString();
      }
      await uploadPendingMediaForOperation(row.operation_id);
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
      const msg = explainSyncError(e instanceof Error ? e.message : String(e));
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

