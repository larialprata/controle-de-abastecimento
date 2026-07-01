import { createSupabaseServiceRole } from "./supabase";
import { canWriteWebPage, type WebWritePageKey } from "./webPermissions";

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

export class WebWriteAccessError extends Error {
  status = 403;
  constructor(message: string) {
    super(message);
    this.name = "WebWriteAccessError";
  }
}

export function writePageForEquipamentoTipo(tipo: string): WebWritePageKey {
  return tipo === "MELOSA" ? "melosas" : "equipamentos";
}
