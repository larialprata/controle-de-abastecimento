import { createSupabaseServiceRole } from "./supabase";
import {
  canWriteBiAction,
  canWriteWebPage,
  type WebBiAction,
  type WebBiPageKey,
  type WebWritePageKey,
} from "./webPermissions";

type Service = ReturnType<typeof createSupabaseServiceRole>;

export type WebWriteProfile = {
  role: string | null;
  access_platform: string | null;
  web_permissions: unknown;
  web_write_permissions: unknown;
};

export async function loadWebWriteProfile(service: Service, userId: string): Promise<WebWriteProfile | null> {
  const { data, error } = await service
    .from("profiles")
    .select("role, access_platform, web_permissions, web_write_permissions")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function assertCanWriteWebPage(profile: WebWriteProfile | null, pageKey: WebWritePageKey): void {
  if (!canWriteWebPage(profile, pageKey)) {
    throw new WebWriteAccessError(`Sem permissão para alterar dados em ${pageKey}.`);
  }
}

export function assertCanWriteBiAction(
  profile: WebWriteProfile | null,
  page: WebBiPageKey,
  action: WebBiAction,
): void {
  if (!canWriteBiAction(profile, page, action)) {
    const labels = { add: "adicionar", edit: "editar", delete: "excluir" } as const;
    throw new WebWriteAccessError(`Sem permissão para ${labels[action]} em ${page}.`);
  }
}

export class WebWriteAccessError extends Error {
  status = 403;
  constructor(message: string) {
    super(message);
    this.name = "WebWriteAccessError";
  }
}

/**
 * Para utilizadores web: exige permissão BI granular.
 * Admin e app passam (app segue regras próprias de dono/obra).
 * Devolve erro HTTP-ready ou null se pode continuar.
 */
export async function denyWebBiWriteIfNeeded(
  service: Service,
  userId: string,
  page: WebBiPageKey,
  action: WebBiAction,
): Promise<{ status: number; error: string } | null> {
  const profile = await loadWebWriteProfile(service, userId);
  if (profile?.role === "admin") return null;
  if (profile?.access_platform !== "web") return null;
  try {
    assertCanWriteBiAction(profile, page, action);
    return null;
  } catch (e) {
    if (e instanceof WebWriteAccessError) return { status: e.status, error: e.message };
    throw e;
  }
}

export function writePageForEquipamentoTipo(tipo: string): WebWritePageKey {
  if (tipo === "MELOSA") return "melosas";
  if (tipo === "TANQUE") return "tanques";
  return "equipamentos";
}
