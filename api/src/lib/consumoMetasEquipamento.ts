import type { SupabaseClient } from "@supabase/supabase-js";

export type MetaEquipamento = {
  ativo: string;
  meta_litros_por_unidade: number;
  unidade: string;
  origem: "manual" | "media";
  updated_at: string | null;
};

function normAtivo(v: string): string {
  return v.trim().toUpperCase();
}

export async function fetchMetasEquipamento(
  service: SupabaseClient,
  ativos: string[],
): Promise<Map<string, MetaEquipamento>> {
  const map = new Map<string, MetaEquipamento>();
  const unique = Array.from(new Set(ativos.map(normAtivo).filter(Boolean)));
  if (unique.length === 0) return map;

  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += 100) {
    chunks.push(unique.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    const { data, error } = await service
      .from("consumo_metas_equipamento")
      .select("ativo, meta_litros_por_unidade, unidade, origem, updated_at")
      .in("ativo", chunk);

    if (error) {
      if (error.message.includes("consumo_metas_equipamento") || error.message.includes("does not exist")) {
        return map;
      }
      throw new Error(error.message);
    }

    (data ?? []).forEach((row) => {
      map.set(normAtivo(row.ativo), {
        ativo: normAtivo(row.ativo),
        meta_litros_por_unidade: Number(row.meta_litros_por_unidade),
        unidade: String(row.unidade),
        origem: row.origem === "media" ? "media" : "manual",
        updated_at: row.updated_at ?? null,
      });
    });
  }

  return map;
}

export async function fetchMetaEquipamento(
  service: SupabaseClient,
  ativo: string,
): Promise<MetaEquipamento | null> {
  const map = await fetchMetasEquipamento(service, [ativo]);
  return map.get(normAtivo(ativo)) ?? null;
}

export async function upsertMetaEquipamento(
  service: SupabaseClient,
  ativo: string,
  meta_litros_por_unidade: number,
  unidade: string,
  origem: "manual" | "media",
): Promise<MetaEquipamento> {
  const alvo = normAtivo(ativo);
  const { data, error } = await service
    .from("consumo_metas_equipamento")
    .upsert(
      {
        ativo: alvo,
        meta_litros_por_unidade,
        unidade,
        origem,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "ativo" },
    )
    .select("ativo, meta_litros_por_unidade, unidade, origem, updated_at")
    .single();

  if (error) throw new Error(error.message);

  return {
    ativo: normAtivo(data.ativo),
    meta_litros_por_unidade: Number(data.meta_litros_por_unidade),
    unidade: String(data.unidade),
    origem: data.origem === "media" ? "media" : "manual",
    updated_at: data.updated_at ?? null,
  };
}

export function metasEquipamentoToRecord(map: Map<string, MetaEquipamento>): Record<string, MetaEquipamento> {
  const out: Record<string, MetaEquipamento> = {};
  map.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}
