/** Nome da empresa proprietária do equipamento (texto livre no banco). */
export type EquipamentoEmpresa = string;

export function normalizeEquipamentoEmpresa(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  const upper = trimmed.toUpperCase();
  if (upper === "TERCEIRIZADO" || upper === "TERCEIRIZADA") return null;
  if (upper === "DIMENSIONAL") return "Dimensional";
  return trimmed.length > 100 ? trimmed.slice(0, 100) : trimmed;
}

export function parseEquipamentoEmpresa(raw: unknown): string | null {
  if (raw == null) return null;
  return normalizeEquipamentoEmpresa(String(raw));
}

/** Compatível com código que ainda chama resolveEquipamentoEmpresa. */
export function resolveEquipamentoEmpresa(raw: string | null | undefined): string | null {
  return normalizeEquipamentoEmpresa(raw);
}

export function labelEquipamentoEmpresa(empresa: string | null | undefined): string {
  return normalizeEquipamentoEmpresa(empresa) ?? "—";
}

export function empresasEquipamentoLabelList(): string {
  return "Informe o nome da empresa (ex.: Dimensional, Construtora ABC).";
}

export function collectEmpresasFromRows(
  rows: Array<{ empresa?: string | null }>,
): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    const name = normalizeEquipamentoEmpresa(row.empresa);
    if (name) set.add(name);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));
}
