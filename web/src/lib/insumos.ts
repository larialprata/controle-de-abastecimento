export const OLEOS_INSUMO = [
  { value: "XP_68", label: "XP 68" },
  { value: "15W40", label: "15W40" },
  { value: "10W30", label: "10W 30" },
  { value: "ATF", label: "ATF" },
  { value: "140_MINERAL", label: "140 Mineral" },
  { value: "ARLA_32", label: "Arla 32" },
] as const;

export const INSUMO_OPCOES = [
  { value: "DIESEL_S10", label: "Diesel S10" },
  { value: "GASOLINA", label: "Gasolina" },
  { value: "ALCOOL", label: "Álcool" },
  ...OLEOS_INSUMO,
] as const;

export function labelInsumo(value: unknown): string {
  const raw = value == null ? "" : String(value).trim();
  if (!raw || raw === "—") return raw || "—";
  const upper = raw.toUpperCase();
  if (upper === "DIESEL" || upper === "DIESEL_S10") return "Diesel";
  if (upper === "GASOLINA") return "Gasolina";
  if (upper === "ALCOOL" || upper === "ÁLCOOL") return "Álcool";
  const found = INSUMO_OPCOES.find((item) => item.value === upper || item.value === raw);
  if (found && found.value !== "DIESEL_S10") return found.label;
  return raw.replaceAll("_", " ");
}
