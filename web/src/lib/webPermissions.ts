export const WEB_PAGES = [
  { key: "dashboard", label: "Dashboard", path: "/" },
  { key: "contratos", label: "Contratos", path: "/contratos" },
  { key: "melosas", label: "Melosas", path: "/melosas" },
  { key: "equipamentos", label: "Equipamentos", path: "/equipamentos" },
  { key: "bi_tanque", label: "BI Tanque", path: "/bi" },
  { key: "bi_melosa", label: "BI Melosa", path: "/bi/melosa" },
] as const;

export type WebPageKey = (typeof WEB_PAGES)[number]["key"];

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

export function canAccessWebPage(
  isAdmin: boolean,
  accessPlatform: string | null | undefined,
  permissions: string[] | null | undefined,
  pageKey: WebPageKey
): boolean {
  if (isAdmin) return true;
  if (accessPlatform !== "web") return false;
  const perms = normalizeWebPermissions(permissions);
  return perms.includes(pageKey);
}

export function pathnameToPageKey(pathname: string): WebPageKey {
  if (pathname === "/" || pathname === "") return "dashboard";
  if (pathname.startsWith("/contratos")) return "contratos";
  if (pathname.startsWith("/melosas")) return "melosas";
  if (pathname.startsWith("/equipamentos")) return "equipamentos";
  if (pathname.startsWith("/bi/melosa")) return "bi_melosa";
  if (pathname.startsWith("/bi")) return "bi_tanque";
  return "dashboard";
}

export function navItemToPageKey(to: string): WebPageKey {
  if (to === "/") return "dashboard";
  if (to === "/contratos") return "contratos";
  if (to === "/melosas") return "melosas";
  if (to === "/equipamentos") return "equipamentos";
  if (to === "/bi/melosa") return "bi_melosa";
  if (to === "/bi") return "bi_tanque";
  return "dashboard";
}
