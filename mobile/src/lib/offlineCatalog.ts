import AsyncStorage from "@react-native-async-storage/async-storage";
import { normalizeAtivoPatrimonio } from "./equipamentoAtivo";

const CATALOG_KEY = "equipamento_catalog_v1";
export const MELOSAS_CACHE_KEY = "melosas_catalog_v1";
export const TANQUES_CACHE_KEY = "tanques_catalog_v1";
export const OBRAS_CACHE_KEY = "obras_catalog_v1";

export type CachedEquipamento = {
  ativo: string;
  nome: string | null;
  empresa: string | null;
  placa: string | null;
  aliases: string[];
};

function normKey(value: string | null | undefined): string {
  return normalizeAtivoPatrimonio(String(value ?? ""));
}

function uniqueAliases(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const key = normKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(String(raw).trim());
  }
  return out;
}

export async function loadJsonCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function saveJsonCache(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // cache é apoio offline; falha aqui não pode bloquear o lançamento
  }
}

export async function loadEquipamentoCatalog(): Promise<CachedEquipamento[]> {
  const items = await loadJsonCache<CachedEquipamento[]>(CATALOG_KEY);
  if (!Array.isArray(items)) return [];
  return items.filter((item) => item?.ativo?.trim());
}

export async function saveEquipamentoCatalog(items: CachedEquipamento[]): Promise<void> {
  await saveJsonCache(CATALOG_KEY, items);
}

export function findCachedEquipamento(
  items: CachedEquipamento[],
  query: string,
): CachedEquipamento | null {
  const key = normKey(query);
  if (!key) return null;
  return (
    items.find((item) => {
      if (normKey(item.ativo) === key) return true;
      if (normKey(item.placa) === key) return true;
      return (item.aliases ?? []).some((alias) => normKey(alias) === key);
    }) ?? null
  );
}

export function upsertCachedEquipamento(
  items: CachedEquipamento[],
  input: {
    ativo: string;
    nome?: string | null;
    empresa?: string | null;
    placa?: string | null;
    aliases?: string[];
  },
  extraAlias?: string | null,
): CachedEquipamento[] {
  const ativo = input.ativo.trim();
  if (!ativo) return items;
  const key = normKey(ativo);
  const current = items.find((item) => normKey(item.ativo) === key);
  const next: CachedEquipamento = {
    ativo: current?.ativo?.trim() || ativo,
    nome: input.nome?.trim() || current?.nome || null,
    empresa: input.empresa?.trim() || current?.empresa || null,
    placa: input.placa?.trim() || current?.placa || null,
    aliases: uniqueAliases([
      ativo,
      input.placa,
      extraAlias,
      ...(input.aliases ?? []),
      ...(current?.aliases ?? []),
      current?.ativo,
      current?.placa,
    ]),
  };
  return [...items.filter((item) => normKey(item.ativo) !== key), next];
}

export function mergeCatalogFromApi(
  previous: CachedEquipamento[],
  rows: Array<{ ativo?: string | null; nome?: string | null; empresa?: string | null; placa?: string | null }>,
): CachedEquipamento[] {
  const byAtivo = new Map<string, CachedEquipamento>();
  for (const item of previous) {
    const key = normKey(item.ativo);
    if (key) byAtivo.set(key, item);
  }
  for (const row of rows) {
    const ativo = String(row.ativo ?? "").trim();
    const key = normKey(ativo);
    if (!key) continue;
    const prev = byAtivo.get(key);
    byAtivo.set(key, {
      ativo,
      nome: row.nome?.trim() || prev?.nome || null,
      empresa: row.empresa?.trim() || prev?.empresa || null,
      placa: row.placa?.trim() || prev?.placa || null,
      aliases: uniqueAliases([ativo, row.placa, ...(prev?.aliases ?? []), prev?.ativo, prev?.placa]),
    });
  }
  return Array.from(byAtivo.values());
}
