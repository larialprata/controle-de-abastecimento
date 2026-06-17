export const EQUIPAMENTO_EMPRESAS = ["DIMENSIONAL", "TERCEIRIZADO"] as const;
export type EquipamentoEmpresa = (typeof EQUIPAMENTO_EMPRESAS)[number];

export const EQUIPAMENTO_EMPRESA_LABEL: Record<EquipamentoEmpresa, string> = {
  DIMENSIONAL: "Dimensional",
  TERCEIRIZADO: "Terceirizado",
};

const EQUIPAMENTO_EMPRESA_SET = new Set<string>(EQUIPAMENTO_EMPRESAS);

function normalizeEmpresaInput(raw: string): string {
  return raw.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

/** Dimensional só quando explícito; qualquer outro valor (ou vazio) é Terceirizado. */
export function resolveEquipamentoEmpresa(raw: string | null | undefined): EquipamentoEmpresa {
  if (!raw?.trim()) return "TERCEIRIZADO";
  const s = normalizeEmpresaInput(raw);
  if (s === "dimensional" || s === "dim" || s.startsWith("dim")) return "DIMENSIONAL";
  return "TERCEIRIZADO";
}

export function isEquipamentoEmpresa(value: string): value is EquipamentoEmpresa {
  return EQUIPAMENTO_EMPRESA_SET.has(value);
}
