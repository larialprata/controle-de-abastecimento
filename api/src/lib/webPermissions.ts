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

export const WEB_CADASTRO_WRITE_KEYS = ["contratos", "melosas", "equipamentos", "tanques"] as const;
export type WebCadastroWriteKey = (typeof WEB_CADASTRO_WRITE_KEYS)[number];

export type WebBiPageKey = "bi_tanque" | "bi_melosa";
export type WebBiAction = "add" | "edit" | "delete";

export const WEB_BI_WRITE_ACTION_KEYS = [
  "bi_tanque_add",
  "bi_tanque_edit",
  "bi_tanque_delete",
  "bi_melosa_add",
  "bi_melosa_edit",
  "bi_melosa_delete",
] as const;

export type WebBiWriteActionKey = (typeof WEB_BI_WRITE_ACTION_KEYS)[number];

export type WebWritePageKey = WebCadastroWriteKey | WebBiWriteActionKey;

/** @deprecated use WEB_CADASTRO_WRITE_KEYS + WEB_BI_WRITE_ACTION_KEYS */
export const WEB_WRITE_PAGE_KEYS = [
  ...WEB_CADASTRO_WRITE_KEYS,
  ...WEB_BI_WRITE_ACTION_KEYS,
] as const;

export const DEFAULT_WEB_PERMISSIONS: WebPageKey[] = ["dashboard"];

export const FULL_WEB_USER_PERMISSIONS: WebPageKey[] = [...WEB_PAGE_KEYS];

const LEGACY_BI_WRITE_KEYS = new Set(["bi_tanque", "bi_melosa"]);

const BI_ACTION_TO_PAGE: Record<WebBiWriteActionKey, WebBiPageKey> = {
  bi_tanque_add: "bi_tanque",
  bi_tanque_edit: "bi_tanque",
  bi_tanque_delete: "bi_tanque",
  bi_melosa_add: "bi_melosa",
  bi_melosa_edit: "bi_melosa",
  bi_melosa_delete: "bi_melosa",
};

export function biWriteActionKey(page: WebBiPageKey, action: WebBiAction): WebBiWriteActionKey {
  return `${page}_${action}` as WebBiWriteActionKey;
}

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

function expandLegacyBiWriteKeys(writeInput: unknown): string[] {
  if (!Array.isArray(writeInput)) return [];
  const out: string[] = [];
  for (const item of writeInput) {
    if (typeof item !== "string") continue;
    if (LEGACY_BI_WRITE_KEYS.has(item)) {
      const page = item as WebBiPageKey;
      out.push(biWriteActionKey(page, "add"), biWriteActionKey(page, "edit"), biWriteActionKey(page, "delete"));
    } else {
      out.push(item);
    }
  }
  return out;
}

export function normalizeWebWritePermissions(
  readPermissions: unknown,
  writeInput: unknown,
): WebWritePageKey[] {
  const read = new Set(normalizeWebPermissions(readPermissions));
  const allowed = new Set<string>(WEB_WRITE_PAGE_KEYS);
  const set = new Set<WebWritePageKey>();

  for (const item of expandLegacyBiWriteKeys(writeInput)) {
    if (!allowed.has(item)) continue;
    const key = item as WebWritePageKey;
    if ((WEB_BI_WRITE_ACTION_KEYS as readonly string[]).includes(key)) {
      const page = BI_ACTION_TO_PAGE[key as WebBiWriteActionKey];
      if (read.has(page)) set.add(key);
      continue;
    }
    if (read.has(key as WebPageKey)) set.add(key);
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
  const write = normalizeWebWritePermissions(profile.web_permissions, profile.web_write_permissions);
  return write.includes(pageKey);
}

export function canWriteBiAction(
  profile: {
    role?: string | null;
    access_platform?: string | null;
    web_permissions?: unknown;
    web_write_permissions?: unknown;
  } | null | undefined,
  page: WebBiPageKey,
  action: WebBiAction,
): boolean {
  return canWriteWebPage(profile, biWriteActionKey(page, action));
}
