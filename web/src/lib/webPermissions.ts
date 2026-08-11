export const WEB_PAGES = [
  { key: "dashboard", label: "Dashboard", path: "/" },
  { key: "contratos", label: "Contratos", path: "/contratos" },
  { key: "melosas", label: "Melosas", path: "/melosas" },
  { key: "equipamentos", label: "Equipamentos", path: "/equipamentos" },
  { key: "tanques", label: "Tanques", path: "/tanques" },
  { key: "bi_tanque", label: "BI Tanque", path: "/bi" },
  { key: "bi_melosa", label: "BI abastecimentos", path: "/bi/melosa" },
  { key: "consumo_medio", label: "Consumo médio", path: "/consumo-medio" },
] as const;

export type WebPageKey = (typeof WEB_PAGES)[number]["key"];

/** Páginas de cadastro em que utilizador web pode criar/editar/excluir. */
export const WEB_WRITE_PAGES = [
  { key: "contratos", label: "Contratos" },
  { key: "melosas", label: "Melosas" },
  { key: "equipamentos", label: "Equipamentos" },
  { key: "tanques", label: "Tanques" },
] as const;

export type WebCadastroWriteKey = (typeof WEB_WRITE_PAGES)[number]["key"];

export type WebBiPageKey = "bi_tanque" | "bi_melosa";
export type WebBiAction = "add" | "edit" | "delete";

/** Ações granulares nos BIs (adicionar / editar / excluir). */
export const WEB_BI_WRITE_ACTIONS = [
  { key: "bi_tanque_add", page: "bi_tanque", action: "add", label: "Adicionar" },
  { key: "bi_tanque_edit", page: "bi_tanque", action: "edit", label: "Editar" },
  { key: "bi_tanque_delete", page: "bi_tanque", action: "delete", label: "Excluir" },
  { key: "bi_melosa_add", page: "bi_melosa", action: "add", label: "Adicionar" },
  { key: "bi_melosa_edit", page: "bi_melosa", action: "edit", label: "Editar" },
  { key: "bi_melosa_delete", page: "bi_melosa", action: "delete", label: "Excluir" },
] as const;

export type WebBiWriteActionKey = (typeof WEB_BI_WRITE_ACTIONS)[number]["key"];

export type WebWritePageKey = WebCadastroWriteKey | WebBiWriteActionKey;

export const WEB_WRITE_PAGE_KEYS: readonly WebWritePageKey[] = [
  ...WEB_WRITE_PAGES.map((p) => p.key),
  ...WEB_BI_WRITE_ACTIONS.map((a) => a.key),
];

export const WEB_BI_PAGES: { key: WebBiPageKey; label: string }[] = [
  { key: "bi_tanque", label: "BI Tanque" },
  { key: "bi_melosa", label: "BI abastecimentos" },
];

export const DEFAULT_WEB_PERMISSIONS: WebPageKey[] = ["dashboard"];

const LEGACY_BI_WRITE_KEYS = new Set(["bi_tanque", "bi_melosa"]);

export function biWriteActionKey(page: WebBiPageKey, action: WebBiAction): WebBiWriteActionKey {
  return `${page}_${action}` as WebBiWriteActionKey;
}

export function biActionsForPage(page: WebBiPageKey) {
  return WEB_BI_WRITE_ACTIONS.filter((a) => a.page === page);
}

export function normalizeWebPermissions(input: unknown): WebPageKey[] {
  const allowed = new Set(WEB_PAGES.map((p) => p.key));
  if (!Array.isArray(input)) return [...DEFAULT_WEB_PERMISSIONS];
  const set = new Set<WebPageKey>();
  for (const item of input) {
    if (typeof item === "string" && allowed.has(item as WebPageKey)) {
      set.add(item as WebPageKey);
    }
  }
  if (!set.has("dashboard")) set.add("dashboard");
  return WEB_PAGES.map((p) => p.key).filter((k) => set.has(k));
}

/** Expande chaves legadas `bi_tanque` / `bi_melosa` (tudo-ou-nada) para as 3 ações. */
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
    const biMeta = WEB_BI_WRITE_ACTIONS.find((a) => a.key === key);
    if (biMeta) {
      if (read.has(biMeta.page)) set.add(key);
      continue;
    }
    if (read.has(key as WebPageKey)) set.add(key);
  }

  return WEB_WRITE_PAGE_KEYS.filter((k) => set.has(k));
}

export function canAccessWebPage(
  isAdmin: boolean,
  accessPlatform: string | null | undefined,
  permissions: string[] | null | undefined,
  pageKey: WebPageKey,
): boolean {
  if (isAdmin) return true;
  if (pageKey === "dashboard") return true;
  if (accessPlatform !== "web" && accessPlatform !== "both") return false;
  return normalizeWebPermissions(permissions).includes(pageKey);
}

export function canWriteWebPage(
  isAdmin: boolean,
  accessPlatform: string | null | undefined,
  readPermissions: string[] | null | undefined,
  writePermissions: string[] | null | undefined,
  pageKey: WebWritePageKey,
): boolean {
  if (isAdmin) return true;
  if (accessPlatform !== "web") return false;
  return normalizeWebWritePermissions(readPermissions, writePermissions).includes(pageKey);
}

export function canWriteBiAction(
  isAdmin: boolean,
  accessPlatform: string | null | undefined,
  readPermissions: string[] | null | undefined,
  writePermissions: string[] | null | undefined,
  page: WebBiPageKey,
  action: WebBiAction,
): boolean {
  return canWriteWebPage(
    isAdmin,
    accessPlatform,
    readPermissions,
    writePermissions,
    biWriteActionKey(page, action),
  );
}

export function pathnameToPageKey(pathname: string): WebPageKey {
  if (pathname === "/" || pathname === "") return "dashboard";
  if (pathname.startsWith("/contratos")) return "contratos";
  if (pathname.startsWith("/melosas")) return "melosas";
  if (pathname.startsWith("/equipamentos")) return "equipamentos";
  if (pathname.startsWith("/tanques")) return "tanques";
  if (pathname.startsWith("/bi/melosa")) return "bi_melosa";
  if (pathname.startsWith("/consumo-medio")) return "consumo_medio";
  if (pathname.startsWith("/auditoria")) return "dashboard";
  if (pathname.startsWith("/bi")) return "bi_tanque";
  return "dashboard";
}

export function navItemToPageKey(to: string): WebPageKey {
  if (to === "/") return "dashboard";
  if (to === "/contratos") return "contratos";
  if (to === "/melosas") return "melosas";
  if (to === "/equipamentos") return "equipamentos";
  if (to === "/tanques") return "tanques";
  if (to === "/bi/melosa") return "bi_melosa";
  if (to === "/consumo-medio") return "consumo_medio";
  if (to === "/auditoria") return "dashboard";
  if (to === "/bi") return "bi_tanque";
  return "dashboard";
}
