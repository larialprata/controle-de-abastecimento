function normalizeAtivoCompact(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

/** Rótulo de equipamento no ticket: descrição completa, com ativo quando forem distintos. */
export function fmtEquipamentoTicketLabel(
  ativo: unknown,
  descricao: unknown,
  fallbackAtivo?: unknown,
): string {
  const ativoText = String(ativo ?? fallbackAtivo ?? "").trim();
  const descricaoText = String(descricao ?? "").trim();
  if (!ativoText && !descricaoText) return "—";

  const descricaoEhAtivo =
    Boolean(descricaoText && ativoText) &&
    normalizeAtivoCompact(descricaoText) === normalizeAtivoCompact(ativoText);

  if (descricaoText && !descricaoEhAtivo) {
    return ativoText ? `${ativoText} — ${descricaoText}` : descricaoText;
  }
  if (descricaoText) return descricaoText;
  return ativoText;
}

type MelosaRowEquipamento = {
  ativo_equipamento_texto?: string | null;
  fornecedor_texto?: string | null;
  ativo_equipamento_nome?: string | null;
  obra_codigo?: number;
};

/** Preenche ativo_equipamento_nome a partir do cadastro quando o registro não tem descrição salva. */
export async function enrichMelosaRowsWithEquipamentoDescricao<T extends MelosaRowEquipamento>(
  token: string,
  rows: T[],
  lookup: (
    ativo: string,
    obraCodigo: number | null,
  ) => Promise<{ nome: string | null } | null>,
): Promise<T[]> {
  const cache = new Map<string, string>();
  const pending: { ativo: string; obra: number | null; key: string }[] = [];

  for (const row of rows) {
    if (String(row.ativo_equipamento_nome ?? "").trim()) continue;
    const ativo = String(row.ativo_equipamento_texto ?? row.fornecedor_texto ?? "").trim();
    if (!ativo) continue;
    const obra = typeof row.obra_codigo === "number" ? row.obra_codigo : null;
    const key = `${normalizeAtivoCompact(ativo)}:${obra ?? ""}`;
    if (!cache.has(key) && !pending.some((item) => item.key === key)) {
      pending.push({ ativo, obra, key });
    }
  }

  await Promise.all(
    pending.map(async ({ ativo, obra, key }) => {
      const found = await lookup(ativo, obra);
      const nome = found?.nome?.trim();
      if (nome) cache.set(key, nome);
    }),
  );

  return rows.map((row) => {
    if (String(row.ativo_equipamento_nome ?? "").trim()) return row;
    const ativo = String(row.ativo_equipamento_texto ?? row.fornecedor_texto ?? "").trim();
    if (!ativo) return row;
    const obra = typeof row.obra_codigo === "number" ? row.obra_codigo : null;
    const key = `${normalizeAtivoCompact(ativo)}:${obra ?? ""}`;
    const nome = cache.get(key);
    if (!nome) return row;
    return { ...row, ativo_equipamento_nome: nome };
  });
}
