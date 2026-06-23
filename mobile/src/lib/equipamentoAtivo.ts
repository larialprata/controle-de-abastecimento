/** Normaliza patrimônio/ativo ignorando espaços e maiúsculas (EHRER03 = EHRER 03). */
export function normalizeAtivoPatrimonio(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function ativosPatrimonioEquivalentes(a: string, b: string): boolean {
  return normalizeAtivoPatrimonio(a) === normalizeAtivoPatrimonio(b);
}
