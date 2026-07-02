export const WEB_PAGES = [
  { key: "dashboard", label: "Dashboard", path: "/" },
  { key: "contratos", label: "Contratos", path: "/contratos" },
  { key: "melosas", label: "Melosas", path: "/melosas" },
  { key: "equipamentos", label: "Equipamentos", path: "/equipamentos" },
  { key: "tanques", label: "Tanques", path: "/tanques" },
  { key: "bi_tanque", label: "BI Tanque", path: "/bi" },
  { key: "bi_melosa", label: "BI Melosa", path: "/bi/melosa" },
] as const;

export type WebPageKey = (typeof WEB_PAGES)[number]["key"];

/** Páginas de cadastro em que utilizador web pode criar/editar/excluir. */
export const WEB_WRITE_PAGES = [
  { key: "contratos", label: "Contratos" },
  { key: "melosas", label: "Melosas" },
  { key: "equipamentos", label: "Equipamentos" },
  { key: "tanques", label: "Tanques" },
] as const;

export type WebWritePageKey = (typeof WEB_WRITE_PAGES)[number]["key"];

export const DEFAULT_WEB_PERMISSIONS: WebPageKey[] = ["dashboard"];

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

export function normalizeWebWritePermissions(
  readPermissions: unknown,
  writeInput: unknown,
): WebWritePageKey[] {
  const read = new Set(normalizeWebPermissions(readPermissions));
  if (!Array.isArray(writeInput)) return [];
  const allowed = new Set(WEB_WRITE_PAGES.map((p) => p.key));
  const set = new Set<WebWritePageKey>();
  for (const item of writeInput) {
    if (
      typeof item === "string" &&
      allowed.has(item as WebWritePageKey) &&
      read.has(item as WebPageKey)
    ) {
      set.add(item as WebWritePageKey);
    }
  }
  return WEB_WRITE_PAGES.map((p) => p.key).filter((k) => set.has(k));
}

export function canAccessWebPage(
  _isAdmin: boolean,
  _accessPlatform: string | null | undefined,
  _permissions: string[] | null | undefined,
  _pageKey: WebPageKey
): boolean {
  return true;
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
  const read = normalizeWebPermissions(readPermissions);
  const write = normalizeWebWritePermissions(readPermissions, writePermissions);
  return read.includes(pageKey) && write.includes(pageKey);
}

export function pathnameToPageKey(pathname: string): WebPageKey {
  if (pathname === "/" || pathname === "") return "dashboard";
  if (pathname.startsWith("/contratos")) return "contratos";
  if (pathname.startsWith("/melosas")) return "melosas";
  if (pathname.startsWith("/equipamentos")) return "equipamentos";
  if (pathname.startsWith("/tanques")) return "tanques";
  if (pathname.startsWith("/bi/melosa")) return "bi_melosa";
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
  if (to === "/bi") return "bi_tanque";
  return "dashboard";
}
