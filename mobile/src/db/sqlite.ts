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
  `);
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

