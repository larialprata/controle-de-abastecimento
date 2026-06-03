import { apiPost } from "../lib/api";
import { getOutboxPending, deleteOutbox } from "../db/sqlite";
import type { MovimentacaoPayload } from "../types/movimentacao";

export async function syncOutbox(token: string) {
  const pending = getOutboxPending();
  if (pending.length === 0) return { synced: 0, total: 0, failed: [] as string[] };

  let synced = 0;
  const failed: string[] = [];

  for (const row of pending) {
    const payload = JSON.parse(row.payload_json) as MovimentacaoPayload;
    payload.operation_id = row.operation_id;

    try {
      await apiPost("/v1/movimentacoes", token, payload, {
        operation_id: row.operation_id,
        tipo: payload.tipo,
      });
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

  return { synced, total: pending.length, failed };
}

