import type { SupabaseClient } from "@supabase/supabase-js";

export type ConsumoMeta = {
  mobilidade: string | null;
  unidade: string;
  meta_litros_por_unidade: number;
  label: string | null;
};

const DEFAULT_METAS: ConsumoMeta[] = [
  { mobilidade: null, unidade: "h", meta_litros_por_unidade: 3, label: "Padrão estacionário (L/h)" },
  { mobilidade: null, unidade: "km", meta_litros_por_unidade: 0.5, label: "Padrão móvel (L/km)" },
  { mobilidade: "ESTACIONARIO", unidade: "h", meta_litros_por_unidade: 2.5, label: "Estacionário (L/h)" },
  { mobilidade: "MOVEL", unidade: "km", meta_litros_por_unidade: 0.35, label: "Móvel (L/km)" },
];

export async function fetchConsumoMetas(service: SupabaseClient): Promise<ConsumoMeta[]> {
  const { data, error } = await service
    .from("consumo_metas")
    .select("mobilidade, unidade, meta_litros_por_unidade, label")
    .order("mobilidade", { ascending: true, nullsFirst: true });

  if (error) {
    if (error.message.includes("consumo_metas") || error.message.includes("does not exist")) {
      return [...DEFAULT_METAS];
    }
    throw new Error(error.message);
  }

  if (!data?.length) return [...DEFAULT_METAS];

  return data.map((row) => ({
    mobilidade: row.mobilidade ?? null,
    unidade: String(row.unidade),
    meta_litros_por_unidade: Number(row.meta_litros_por_unidade),
    label: row.label ?? null,
  }));
}

export function resolveMetaParaEquipamento(
  metas: ConsumoMeta[],
  mobilidade: string | null | undefined,
  unidade: string,
): number | null {
  const mob = mobilidade ? String(mobilidade).toUpperCase() : null;
  const especifica = metas.find((m) => m.unidade === unidade && m.mobilidade === mob);
  if (especifica) return especifica.meta_litros_por_unidade;
  const fallback = metas.find((m) => m.unidade === unidade && m.mobilidade == null);
  return fallback?.meta_litros_por_unidade ?? null;
}

export type ConsumoMetaInput = {
  mobilidade: string | null;
  unidade: string;
  meta_litros_por_unidade: number;
  label?: string | null;
};

export async function upsertConsumoMetas(
  service: SupabaseClient,
  items: ConsumoMetaInput[],
): Promise<ConsumoMeta[]> {
  for (const item of items) {
    const { error } = await service.from("consumo_metas").upsert(
      {
        mobilidade: item.mobilidade,
        unidade: item.unidade,
        meta_litros_por_unidade: item.meta_litros_por_unidade,
        label: item.label ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "mobilidade,unidade" },
    );
    if (error) throw new Error(error.message);
  }
  return fetchConsumoMetas(service);
}
