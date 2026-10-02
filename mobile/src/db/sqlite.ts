import * as SQLite from "expo-sqlite";

export const db = SQLite.openDatabaseSync("controle-abastecimento.db");

export async function initDb() {
  // Usamos execSync para não depender do modo async do driver.
  db.execSync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_id TEXT NOT NULL UNIQUE,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pending_media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_id TEXT NOT NULL,
      bucket TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      local_uri TEXT NOT NULL,
      content_type TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_pending_media_operation ON pending_media(operation_id);
  `);
}

export type PendingMediaRow = {
  operation_id: string;
  bucket: string;
  storage_path: string;
  local_uri: string;
  content_type: string;
};

export function insertPendingMedia(row: PendingMediaRow) {
  db.runSync(
    `INSERT INTO pending_media (operation_id, bucket, storage_path, local_uri, content_type) VALUES (?, ?, ?, ?, ?)`,
    [row.operation_id, row.bucket, row.storage_path, row.local_uri, row.content_type],
  );
}

export function getPendingMedia(operationId: string): PendingMediaRow[] {
  const rows = db.getAllSync<PendingMediaRow>(
    `SELECT operation_id, bucket, storage_path, local_uri, content_type FROM pending_media WHERE operation_id = ? ORDER BY id ASC`,
    [operationId],
  );
  return rows ?? [];
}

export function deletePendingMedia(operationId: string) {
  db.runSync(`DELETE FROM pending_media WHERE operation_id = ?`, [operationId]);
}

export type OutboxRow = { operation_id: string; payload_json: string };

export function outboxCount(): number {
  const rows = db.getAllSync<{ c: number }>("SELECT COUNT(*) as c FROM outbox");
  return rows?.[0]?.c ?? 0;
}

export function enqueueOutbox(operationId: string, payload: unknown) {
  const payloadJson = JSON.stringify(payload);
  db.runSync(
    `INSERT OR REPLACE INTO outbox (operation_id, payload_json) VALUES (?, ?)`,
    [operationId, payloadJson]
  );
}

export function clearOutbox() {
  db.runSync(`DELETE FROM outbox`);
}

export function getOutboxPending(): OutboxRow[] {
  const rows = db.getAllSync<{ operation_id: string; payload_json: string }>(
    `SELECT operation_id, payload_json FROM outbox ORDER BY created_at ASC`
  );
  return rows ?? [];
}

export function deleteOutbox(operationId: string) {
  db.runSync(`DELETE FROM outbox WHERE operation_id = ?`, [operationId]);
}

export function updateOutboxPayload(operationId: string, payload: unknown) {
  db.runSync(`UPDATE outbox SET payload_json = ? WHERE operation_id = ?`, [
    JSON.stringify(payload),
    operationId,
  ]);
}

