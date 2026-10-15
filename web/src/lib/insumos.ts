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

export function codigoOleoPorTexto(raw: unknown): string | null {
  const key = compactOleo(raw == null ? "" : String(raw));
  if (!key || key.includes("DIESEL") || key.includes("GASOLINA") || key.includes("ALCOOL")) return null;
  for (const oleo of OLEO_TOKENS) {
    if (oleo.tokens.some((token) => key.includes(token))) return oleo.value;
  }
  return null;
}

export function tanqueNumeroDoOleo(
  tanques: { nome?: string | null; tanque_numero?: number | null }[],
  combustivel: unknown,
): string | null {
  const oleo = codigoOleoPorTexto(combustivel);
  if (!oleo) return null;
  const found = tanques.find((t) => t.tanque_numero != null && codigoOleoPorTexto(t.nome) === oleo);
  return found ? String(found.tanque_numero) : null;
}

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
