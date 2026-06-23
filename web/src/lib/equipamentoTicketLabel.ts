function normalizeAtivoCompact(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function pickDescricaoEquipamento(patrimonio: string, descricao: string): string {
  const descricaoText = descricao.trim();
  if (!descricaoText) return "";
  if (patrimonio && normalizeAtivoCompact(descricaoText) === patrimonio) return "";
  return descricaoText;
}

/**
 * Rótulo do equipamento no ticket BI: `PATRIMONIO - Descrição`
 * Ex.: EHRER03 - Escavadeira Hidráulica
 */
export function fmtEquipamentoTicketLabel(
  ativo: unknown,
  descricao: unknown,
  fallbackAtivo?: unknown,
): string {
  const ativoRaw = String(ativo ?? fallbackAtivo ?? "").trim();
  const patrimonio = ativoRaw ? normalizeAtivoCompact(ativoRaw) : "";
  const descricaoUtil = pickDescricaoEquipamento(patrimonio, String(descricao ?? ""));

  if (patrimonio && descricaoUtil) return `${patrimonio} - ${descricaoUtil}`;
  if (descricaoUtil) return descricaoUtil;
  if (patrimonio) return patrimonio;
  return "—";
}

type MelosaRowEquipamento = {
  ativo_equipamento_texto?: string | null;
  fornecedor_texto?: string | null;
  ativo_equipamento_nome?: string | null;
  obra_codigo?: number;
};

/** Busca descrição no cadastro para montar o ticket (patrimônio + descrição). */
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
      const patrimonio = normalizeAtivoCompact(ativo);
      const nome = pickDescricaoEquipamento(patrimonio, found?.nome ?? "");
      if (nome) cache.set(key, nome);
    }),
  );

  return rows.map((row) => {
    const ativo = String(row.ativo_equipamento_texto ?? row.fornecedor_texto ?? "").trim();
    if (!ativo) return row;
    const obra = typeof row.obra_codigo === "number" ? row.obra_codigo : null;
    const key = `${normalizeAtivoCompact(ativo)}:${obra ?? ""}`;
    const nomeCadastro = cache.get(key);
    if (nomeCadastro) {
      return { ...row, ativo_equipamento_nome: nomeCadastro };
    }
    const nomeSalvo = pickDescricaoEquipamento(
      normalizeAtivoCompact(ativo),
      String(row.ativo_equipamento_nome ?? ""),
    );
    if (nomeSalvo) return { ...row, ativo_equipamento_nome: nomeSalvo };
    return row;
  });
}
