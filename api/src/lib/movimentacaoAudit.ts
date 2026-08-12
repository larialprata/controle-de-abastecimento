import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditEntity = "melosa" | "tanque";
export type AuditAction = "insert" | "update" | "delete";

export type AuditLogInput = {
  entity: AuditEntity;
  action: AuditAction;
  operationId: string;
  obraCodigo?: number | null;
  actorUserId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

/** Campos sensíveis / pesados que não precisam ir no snapshot. */
const STRIP_KEYS: ReadonlySet<string> = new Set([
  // storage paths podem ficar; dados base64 nunca devem chegar aqui
]);

function slimRow(row: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (STRIP_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

export async function logMovimentacaoAudit(
  service: SupabaseClient,
  input: AuditLogInput,
): Promise<void> {
  try {
    const { error } = await service.from("movimentacao_audit").insert({
      entity: input.entity,
      action: input.action,
      operation_id: input.operationId,
      obra_codigo: input.obraCodigo ?? null,
      actor_user_id: input.actorUserId ?? null,
      before: slimRow(input.before ?? null),
      after: slimRow(input.after ?? null),
    });
    if (error) {
      console.warn("[audit] falha ao gravar:", error.message);
    }
  } catch (err: unknown) {
    console.warn("[audit] erro:", err instanceof Error ? err.message : err);
  }
}

export type AuditListFiltros = {
  de?: string | null;
  ate?: string | null;
  entity?: AuditEntity | null;
  action?: AuditAction | null;
  operationId?: string | null;
  actorUserId?: string | null;
  obraCodigo?: number | null;
  limit?: number;
  /** Só alterações feitas por utilizador web (não admin / não app). */
  webUsersOnly?: boolean;
};

export type AuditRow = {
  id: string;
  entity: AuditEntity;
  action: AuditAction;
  operation_id: string;
  obra_codigo: number | null;
  actor_user_id: string | null;
  actor_full_name: string | null;
  actor_email: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
  changed_keys: string[];
};

function diffKeys(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string[] {
  if (!before && !after) return [];
  if (!before) return Object.keys(after ?? {});
  if (!after) return Object.keys(before);
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  keys.forEach((k) => {
    const a = JSON.stringify(before[k] ?? null);
    const b = JSON.stringify(after[k] ?? null);
    if (a !== b) changed.push(k);
  });
  return changed.sort();
}

export async function listMovimentacaoAudit(
  service: SupabaseClient,
  filtros: AuditListFiltros,
  obraScope: number[] | null,
): Promise<AuditRow[]> {
  const limit = Math.min(Math.max(filtros.limit ?? 200, 1), 500);
  let query = service
    .from("movimentacao_audit")
    .select("id, entity, action, operation_id, obra_codigo, actor_user_id, before, after, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filtros.webUsersOnly) {
    const { data: webProfiles, error: webErr } = await service
      .from("profiles")
      .select("user_id")
      .eq("access_platform", "web");
    if (webErr) throw new Error(webErr.message);
    const webIds = (webProfiles ?? [])
      .map((p) => (typeof p.user_id === "string" ? p.user_id : null))
      .filter((id): id is string => Boolean(id));
    if (webIds.length === 0) return [];
    query = query.in("actor_user_id", webIds);
  }

  if (filtros.de) query = query.gte("created_at", `${filtros.de}T00:00:00`);
  if (filtros.ate) query = query.lte("created_at", `${filtros.ate}T23:59:59`);
  if (filtros.entity) query = query.eq("entity", filtros.entity);
  if (filtros.action) query = query.eq("action", filtros.action);
  if (filtros.operationId) query = query.eq("operation_id", filtros.operationId);
  if (filtros.actorUserId) query = query.eq("actor_user_id", filtros.actorUserId);
  if (filtros.obraCodigo != null) {
    query = query.eq("obra_codigo", filtros.obraCodigo);
  } else if (obraScope && obraScope.length > 0) {
    query = query.in("obra_codigo", obraScope);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Omit<AuditRow, "actor_full_name" | "actor_email" | "changed_keys">[];
  const userIds = Array.from(
    new Set(rows.map((r) => r.actor_user_id).filter((id): id is string => typeof id === "string")),
  );

  const nameById = new Map<string, string>();
  const emailById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await service
      .from("profiles")
      .select("user_id, full_name, email")
      .in("user_id", userIds);
    (profiles ?? []).forEach((p) => {
      if (p.user_id && p.full_name) nameById.set(String(p.user_id), String(p.full_name));
      if (p.user_id && p.email) emailById.set(String(p.user_id), String(p.email));
    });
  }

  return rows.map((r) => ({
    ...r,
    before: (r.before as Record<string, unknown> | null) ?? null,
    after: (r.after as Record<string, unknown> | null) ?? null,
    actor_full_name: r.actor_user_id ? nameById.get(r.actor_user_id) ?? null : null,
    actor_email: r.actor_user_id ? emailById.get(r.actor_user_id) ?? null : null,
    changed_keys: diffKeys(
      (r.before as Record<string, unknown> | null) ?? null,
      (r.after as Record<string, unknown> | null) ?? null,
    ),
  }));
}
