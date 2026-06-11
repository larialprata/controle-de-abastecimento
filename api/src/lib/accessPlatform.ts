export type AccessPlatform = "app" | "web" | "both";
export type ClientPlatform = "app" | "web";

export function parseClientPlatform(value: unknown): ClientPlatform | null {
  if (value === "app" || value === "web") return value;
  return null;
}

export function canAccessClientPlatform(
  profile: { role?: string | null; access_platform?: string | null },
  client: ClientPlatform
): boolean {
  if (profile.role === "admin") return true;
  const platform = (profile.access_platform ?? "app") as AccessPlatform;
  if (platform === "both") return true;
  return platform === client;
}

export function accessPlatformLabel(platform: AccessPlatform | string | null | undefined, role?: string | null): string {
  if (role === "admin") return "Admin";
  if (platform === "web") return "Utilizador Web";
  return "Utilizador App";
}
