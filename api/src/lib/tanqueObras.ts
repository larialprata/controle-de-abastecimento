import type { createSupabaseServiceRole } from "./supabase";

type Service = ReturnType<typeof createSupabaseServiceRole>;

export async function listTanqueObrasForAtivos(
  service: Service,
  ativos: string[],
): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>();
  if (ativos.length === 0) return map;

  const { data, error } = await service
    .from("tanque_obras")
    .select("ativo, obra_codigo")
    .in("ativo", ativos)
    .order("obra_codigo");
  if (error) throw error;

  for (const row of data ?? []) {
    const ativo = String(row.ativo ?? "").trim();
    const codigo = Number(row.obra_codigo);
    if (!ativo || !Number.isFinite(codigo)) continue;
    const list = map.get(ativo) ?? [];
    list.push(codigo);
    map.set(ativo, list);
  }
  return map;
}

export async function listTanqueAtivosForObra(
  service: Service,
  obraCodigo: number,
): Promise<string[]> {
  const { data, error } = await service
    .from("tanque_obras")
    .select("ativo")
    .eq("obra_codigo", obraCodigo);
  if (error) throw error;
  return (data ?? [])
    .map((r) => String(r.ativo ?? "").trim())
    .filter(Boolean);
}

export async function listTanqueAtivosForObras(
  service: Service,
  obraCodigos: number[],
): Promise<string[]> {
  if (obraCodigos.length === 0) return [];
  const { data, error } = await service
    .from("tanque_obras")
    .select("ativo")
    .in("obra_codigo", obraCodigos);
  if (error) throw error;
  return Array.from(
    new Set(
      (data ?? [])
        .map((r) => String(r.ativo ?? "").trim())
        .filter(Boolean),
    ),
  );
}

/**
 * Garante que nenhum outro tanque com o mesmo número já está vinculado às obras informadas.
 */
export async function assertTanqueNumeroLivreNasObras(
  service: Service,
  tanqueNumero: number,
  obraCodigos: number[],
  excludeAtivo?: string | null,
): Promise<void> {
  const uniqueObras = Array.from(new Set(obraCodigos.filter((c) => Number.isFinite(c) && c > 0)));
  if (uniqueObras.length === 0) return;

  const { data: links, error: linksErr } = await service
    .from("tanque_obras")
    .select("ativo, obra_codigo")
    .in("obra_codigo", uniqueObras);
  if (linksErr) throw linksErr;

  const ativos = Array.from(
    new Set(
      (links ?? [])
        .map((r) => String(r.ativo ?? "").trim())
        .filter((a) => a && a !== (excludeAtivo ?? "")),
    ),
  );
  if (ativos.length === 0) return;

  const { data: tanques, error: tanquesErr } = await service
    .from("equipamentos")
    .select("ativo, tanque_numero, obra_codigo")
    .eq("tipo", "TANQUE")
    .eq("tanque_numero", tanqueNumero)
    .in("ativo", ativos);
  if (tanquesErr) throw tanquesErr;

  if ((tanques ?? []).length > 0) {
    const conflito = tanques![0];
    const obraDoLink = (links ?? []).find((l) => String(l.ativo) === String(conflito.ativo))?.obra_codigo;
    throw new Error(
      `Já existe o tanque ${tanqueNumero} na obra ${obraDoLink ?? conflito.obra_codigo}.`,
    );
  }
}

export async function setTanqueObras(
  service: Service,
  ativo: string,
  obraCodigos: number[],
): Promise<number[]> {
  const unique = Array.from(
    new Set(obraCodigos.filter((c) => Number.isFinite(c) && c > 0)),
  ).sort((a, b) => a - b);

  if (unique.length === 0) {
    throw new Error("Informe ao menos uma obra para o tanque.");
  }

  const { data: obras, error: obrasErr } = await service
    .from("obras")
    .select("codigo")
    .in("codigo", unique);
  if (obrasErr) throw obrasErr;
  const found = new Set((obras ?? []).map((o) => Number(o.codigo)));
  const missing = unique.filter((c) => !found.has(c));
  if (missing.length > 0) {
    throw new Error(`Obra(s) não encontrada(s): ${missing.join(", ")}`);
  }

  const { error: delErr } = await service.from("tanque_obras").delete().eq("ativo", ativo);
  if (delErr) throw delErr;

  const { error: insErr } = await service.from("tanque_obras").insert(
    unique.map((obra_codigo) => ({ ativo, obra_codigo })),
  );
  if (insErr) throw insErr;

  return unique;
}

export async function findTanqueCadastradoNaObra(
  service: Service,
  obraCodigo: number,
  tanqueNumero: number,
): Promise<{ ativo: string; obra_codigo: number | null; tanque_numero: number | null } | null> {
  const ativos = await listTanqueAtivosForObra(service, obraCodigo);
  if (ativos.length === 0) {
    // fallback legado: só obra principal
    const { data } = await service
      .from("equipamentos")
      .select("ativo, obra_codigo, tanque_numero")
      .eq("tipo", "TANQUE")
      .eq("obra_codigo", obraCodigo)
      .eq("tanque_numero", tanqueNumero)
      .maybeSingle();
    return data ?? null;
  }

  const { data } = await service
    .from("equipamentos")
    .select("ativo, obra_codigo, tanque_numero")
    .eq("tipo", "TANQUE")
    .eq("tanque_numero", tanqueNumero)
    .in("ativo", ativos)
    .maybeSingle();
  return data ?? null;
}
