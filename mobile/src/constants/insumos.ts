export const OLEOS_INSUMO = [
  { value: "XP_68", label: "XP 68" },
  { value: "15W40", label: "15W40" },
  { value: "10W30", label: "10W 30" },
  { value: "ATF", label: "ATF" },
  { value: "140_MINERAL", label: "140 Mineral" },
  { value: "ARLA_32", label: "Arla 32" },
] as const;

const OLEO_TOKENS: Array<{ value: string; tokens: string[] }> = [
  { value: "XP_68", tokens: ["XP68"] },
  { value: "15W40", tokens: ["15W40"] },
  { value: "10W30", tokens: ["10W30"] },
  { value: "140_MINERAL", tokens: ["140MINERAL"] },
  { value: "ARLA_32", tokens: ["ARLA"] },
  { value: "ATF", tokens: ["ATF"] },
];

function compactOleo(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function codigoOleoPorTexto(raw: string | null | undefined): string | null {
  const key = compactOleo(String(raw ?? ""));
  if (!key || key.includes("DIESEL") || key.includes("GASOLINA") || key.includes("ALCOOL")) return null;
  for (const oleo of OLEO_TOKENS) {
    if (oleo.tokens.some((token) => key.includes(token))) return oleo.value;
  }
  return null;
}

export const INSUMOS_TANQUE = [
  { value: "DIESEL_S10", label: "Diesel/S10 Aditivado" },
  { value: "GASOLINA", label: "Gasolina" },
  { value: "ALCOOL", label: "Álcool" },
  ...OLEOS_INSUMO,
] as const;

export const INSUMOS_MELOSA = [
  { value: "DIESEL", label: "Diesel" },
  { value: "GASOLINA", label: "Gasolina" },
  ...OLEOS_INSUMO,
] as const;

const TODOS_INSUMOS = [...INSUMOS_TANQUE, ...INSUMOS_MELOSA];

export function labelInsumo(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const found = TODOS_INSUMOS.find((item) => item.value === raw);
  if (found) return found.label;
  return raw.replace(/_/g, " ");
}
