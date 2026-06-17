export const EQUIPAMENTO_EMPRESAS = ["DIMENSIONAL", "TERCEIRIZADO"] as const;
export type EquipamentoEmpresa = (typeof EQUIPAMENTO_EMPRESAS)[number];

export const EQUIPAMENTO_EMPRESA_LABEL: Record<EquipamentoEmpresa, string> = {
  DIMENSIONAL: "Dimensional",
  TERCEIRIZADO: "Terceirizado",
};

export function resolveEquipamentoEmpresa(raw: string | null | undefined): EquipamentoEmpresa {
  if (!raw?.trim()) return "TERCEIRIZADO";
  const s = raw.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (s === "dimensional" || s === "dim" || s.startsWith("dim")) return "DIMENSIONAL";
  return "TERCEIRIZADO";
}

export function labelEquipamentoEmpresa(empresa: string | null | undefined): string {
  return EQUIPAMENTO_EMPRESA_LABEL[resolveEquipamentoEmpresa(empresa)];
}
