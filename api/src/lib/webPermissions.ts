export const WEB_PAGE_KEYS = [
  "dashboard",
  "contratos",
  "equipamentos",
  "bi_tanque",
  "bi_melosa",
] as const;

export type WebPageKey = (typeof WEB_PAGE_KEYS)[number];

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
