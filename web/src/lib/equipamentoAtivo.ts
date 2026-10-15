export function compactAtivoKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s\-]/g, "");
}

/** `E215ME_00.238` é o patrimônio E215ME da obra 238. */
export function ativoLimpoParaCadastro(raw: string): { ativo: string; obraDoSufixo: number | null } {
  const trimmed = raw.trim().toUpperCase();
  const match = trimmed.match(/^(.*?)_0*\.(\d+)$/);
  if (match?.[1]) {
    const obra = Number(match[2]);
    return {
      ativo: match[1].trim(),
      obraDoSufixo: Number.isFinite(obra) && obra > 0 ? obra : null,
    };
  }
  return { ativo: trimmed, obraDoSufixo: null };
}

export function chavesPatrimonio(raw: unknown): string[] {
  const texto = String(raw ?? "").trim();
  if (!texto) return [];
  const keys = new Set<string>();
  const full = compactAtivoKey(texto);
  if (full) keys.add(full);
  const limpo = ativoLimpoParaCadastro(texto);
  const base = compactAtivoKey(limpo.ativo);
  if (base) keys.add(base);
  return [...keys];
}
