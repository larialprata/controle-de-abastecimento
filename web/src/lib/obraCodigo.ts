/** Remove prefixos "00." usados em planilhas (ex.: 00.230 → 230). */
export function normalizeObraCodigoString(raw: string): string {
  let s = raw.trim().replace(/\s/g, "").replace(",", ".");
  while (/^00\./.test(s)) {
    s = s.slice(3);
  }
  return s;
}

/** Interpreta código de obra/contrato vindo de planilha ou formulário. */
export function parseObraCodigoInput(raw: unknown): number | null {
  if (raw == null) return null;

  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.trunc(raw);
  }

  const s = normalizeObraCodigoString(String(raw));
  if (!s) return null;

  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  return null;
}

export function parseObraReferencia(
  raw: unknown,
): { obra_codigo?: number; obra_nome?: string } {
  const codigo = parseObraCodigoInput(raw);
  if (codigo != null) return { obra_codigo: codigo };

  const nome = String(raw ?? "").trim();
  if (!nome) return {};
  return { obra_nome: nome };
}
