/** Chave estável para seleção no BI (não depende do índice na lista filtrada). */
export function biMovementRowKey(
  row: { id?: unknown; operation_id?: unknown },
  fallbackIndex?: number,
): string {
  const id = row.id != null && String(row.id).trim() !== "" ? String(row.id).trim() : "";
  const op =
    row.operation_id != null && String(row.operation_id).trim() !== ""
      ? String(row.operation_id).trim()
      : "";
  if (op && id) return `${op}:${id}`;
  if (id) return `id:${id}`;
  if (op) return `op:${op}:${fallbackIndex ?? 0}`;
  return `row:${fallbackIndex ?? 0}`;
}

/** Chave única por linha na tabela (evita colisão quando id/operation_id repetem). */
export function biTableRowKey(
  row: { id?: unknown; operation_id?: unknown },
  index: number,
): string {
  return `${biMovementRowKey(row, index)}#${index}`;
}

/** Resolve linhas selecionadas na ordem em que foram marcadas. */
export function resolveSelectedRows<T>(
  filtradas: T[],
  selectedKeys: string[],
  keyOf: (row: T, index: number) => string = (row, index) =>
    biMovementRowKey(row as { id?: unknown; operation_id?: unknown }, index),
): T[] {
  if (selectedKeys.length === 0) return [];

  const keySet = new Set(selectedKeys);
  const byKey = new Map<string, T>();
  filtradas.forEach((row, index) => {
    const key = keyOf(row, index);
    if (keySet.has(key)) {
      byKey.set(key, row);
    }
  });

  const ordered: T[] = [];
  const seen = new Set<string>();
  for (const key of selectedKeys) {
    if (seen.has(key)) continue;
    const row = byKey.get(key);
    if (row) {
      ordered.push(row);
      seen.add(key);
    }
  }
  return ordered;
}
