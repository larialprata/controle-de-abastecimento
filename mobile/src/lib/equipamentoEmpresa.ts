export type EquipamentoEmpresa = string;

export function normalizeEquipamentoEmpresa(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  const upper = trimmed.toUpperCase();
  if (upper === "TERCEIRIZADO" || upper === "TERCEIRIZADA") return null;
  if (upper === "DIMENSIONAL") return "Dimensional";
  return trimmed.length > 100 ? trimmed.slice(0, 100) : trimmed;
}

export function labelEquipamentoEmpresa(empresa: string | null | undefined): string {
  return normalizeEquipamentoEmpresa(empresa) ?? "—";
}
