export type ConsumoMeta = {
  mobilidade: string | null;
  unidade: string;
  meta_litros_por_unidade: number;
  label: string | null;
};

export type MetaEquipamento = {
  ativo: string;
  meta_litros_por_unidade: number;
  unidade: string;
  origem: "manual" | "media";
  updated_at: string | null;
};

const DEFAULT_METAS: ConsumoMeta[] = [
  { mobilidade: null, unidade: "h", meta_litros_por_unidade: 3, label: "Padrão estacionário (L/h)" },
  { mobilidade: null, unidade: "km", meta_litros_por_unidade: 0.5, label: "Padrão móvel (L/km)" },
  { mobilidade: "ESTACIONARIO", unidade: "h", meta_litros_por_unidade: 2.5, label: "Estacionário (L/h)" },
  { mobilidade: "MOVEL", unidade: "km", meta_litros_por_unidade: 0.35, label: "Móvel (L/km)" },
];

export function resolveMetaParaEquipamento(
  metas: ConsumoMeta[],
  mobilidade: string | null | undefined,
  unidade: string,
): number | null {
  const list = metas.length > 0 ? metas : DEFAULT_METAS;
  const mob = mobilidade ? String(mobilidade).toUpperCase() : null;
  const especifica = list.find((m) => m.unidade === unidade && m.mobilidade === mob);
  if (especifica) return especifica.meta_litros_por_unidade;
  const fallback = list.find((m) => m.unidade === unidade && m.mobilidade == null);
  return fallback?.meta_litros_por_unidade ?? null;
}

export function resolveMetaEfetiva(
  ativo: string,
  unidade: string,
  mobilidade: string | null | undefined,
  metasGlobais: ConsumoMeta[],
  metasEquipamento: Record<string, MetaEquipamento>,
): { meta: number | null; origem: "equipamento" | "mobilidade" | null } {
  const eqMeta = metasEquipamento[ativo];
  if (eqMeta && eqMeta.unidade === unidade) {
    return { meta: eqMeta.meta_litros_por_unidade, origem: "equipamento" };
  }
  const global = resolveMetaParaEquipamento(metasGlobais, mobilidade, unidade);
  return { meta: global, origem: global != null ? "mobilidade" : null };
}

export { DEFAULT_METAS };
