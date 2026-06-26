import type { createSupabaseServiceRole } from "./supabase";

type Service = ReturnType<typeof createSupabaseServiceRole>;

export async function isUserAdmin(service: Service, userId: string): Promise<boolean> {
  const { data, error } = await service.from("profiles").select("role").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data?.role === "admin";
}

/**
 * Obras permitidas ao utilizador.
 * - `null` = sem restrição (admin ou sem vínculos em profile_obras)
 * - `number[]` = só essas obras
 */
export async function getUserObraCodigos(service: Service, userId: string): Promise<number[] | null> {
  if (await isUserAdmin(service, userId)) return null;

  const { data, error } = await service
    .from("profile_obras")
    .select("obra_codigo")
    .eq("user_id", userId)
    .order("obra_codigo");
  if (error) throw error;

  const codigos = (data ?? [])
    .map((r) => r.obra_codigo)
    .filter((c): c is number => typeof c === "number" && Number.isFinite(c));
  if (codigos.length === 0) return null;
  return codigos;
}

export async function assertUserObraAccess(
  service: Service,
  userId: string,
  obraCodigo: number,
): Promise<void> {
  const allowed = await getUserObraCodigos(service, userId);
  if (allowed == null) return;
  if (!allowed.includes(obraCodigo)) {
    throw new ObraAccessError(`Sem permissão para a obra ${obraCodigo}.`);
  }
}

export class ObraAccessError extends Error {
  status = 403;
  constructor(message: string) {
    super(message);
    this.name = "ObraAccessError";
  }
}

export async function setUserObraCodigos(
  service: Service,
  userId: string,
  obraCodigos: number[],
): Promise<void> {
  const unique = Array.from(new Set(obraCodigos.filter((c) => Number.isFinite(c) && c > 0))).sort(
    (a, b) => a - b,
  );

  if (unique.length > 0) {
    const { data: obras, error: obrasErr } = await service.from("obras").select("codigo").in("codigo", unique);
    if (obrasErr) throw obrasErr;
    const found = new Set((obras ?? []).map((o) => o.codigo));
    const missing = unique.filter((c) => !found.has(c));
    if (missing.length > 0) {
      throw new Error(`Obra(s) não encontrada(s): ${missing.join(", ")}`);
    }
  }

  const { error: delErr } = await service.from("profile_obras").delete().eq("user_id", userId);
  if (delErr) throw delErr;

  if (unique.length === 0) return;

  const { error: insErr } = await service.from("profile_obras").insert(
    unique.map((obra_codigo) => ({ user_id: userId, obra_codigo })),
  );
  if (insErr) throw insErr;
}

export async function listObraCodigosForUsers(
  service: Service,
  userIds: string[],
): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>();
  if (userIds.length === 0) return map;

  const { data, error } = await service
    .from("profile_obras")
    .select("user_id, obra_codigo")
    .in("user_id", userIds)
    .order("obra_codigo");
  if (error) throw error;

  for (const row of data ?? []) {
    const uid = row.user_id as string;
    const codigo = row.obra_codigo as number;
    const list = map.get(uid) ?? [];
    list.push(codigo);
    map.set(uid, list);
  }
  return map;
}
