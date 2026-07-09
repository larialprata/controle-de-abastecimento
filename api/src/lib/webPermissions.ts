export const WEB_PAGE_KEYS = [
  "dashboard",
  "contratos",
  "melosas",
  "equipamentos",
  "tanques",
  "bi_tanque",
  "bi_melosa",
  "consumo_medio",
] as const;

export type WebPageKey = (typeof WEB_PAGE_KEYS)[number];

/** Páginas de cadastro em que utilizador web pode criar/editar/excluir. */
export const WEB_WRITE_PAGE_KEYS = ["contratos", "melosas", "equipamentos", "tanques"] as const;

export type WebWritePageKey = (typeof WEB_WRITE_PAGE_KEYS)[number];

export const DEFAULT_WEB_PERMISSIONS: WebPageKey[] = ["dashboard"];

export const FULL_WEB_USER_PERMISSIONS: WebPageKey[] = [...WEB_PAGE_KEYS];

export function normalizeWebPermissions(input: unknown): WebPageKey[] {
  if (!Array.isArray(input)) return [...DEFAULT_WEB_PERMISSIONS];
  const set = new Set<WebPageKey>();
  for (const item of input) {
    if (typeof item === "string" && (WEB_PAGE_KEYS as readonly string[]).includes(item)) {
      set.add(item as WebPageKey);
    }
  }
  if (!set.has("dashboard")) set.add("dashboard");
  return WEB_PAGE_KEYS.filter((k) => set.has(k));
}

export function normalizeWebWritePermissions(
  readPermissions: unknown,
  writeInput: unknown,
): WebWritePageKey[] {
  const read = new Set(normalizeWebPermissions(readPermissions));
  if (!Array.isArray(writeInput)) return [];
  const set = new Set<WebWritePageKey>();
  for (const item of writeInput) {
    if (
      typeof item === "string" &&
      (WEB_WRITE_PAGE_KEYS as readonly string[]).includes(item) &&
      read.has(item as WebPageKey)
    ) {
      set.add(item as WebWritePageKey);
    }
  }
  return WEB_WRITE_PAGE_KEYS.filter((k) => set.has(k));
}

export function canWriteWebPage(
  profile: {
    role?: string | null;
    access_platform?: string | null;
    web_permissions?: unknown;
    web_write_permissions?: unknown;
  } | null | undefined,
  pageKey: WebWritePageKey,
): boolean {
  if (profile?.role === "admin") return true;
  if (profile?.access_platform !== "web") return false;
  const read = normalizeWebPermissions(profile.web_permissions);
  const write = normalizeWebWritePermissions(profile.web_permissions, profile.web_write_permissions);
  return read.includes(pageKey) && write.includes(pageKey);
}
