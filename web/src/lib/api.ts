import { requireEnv } from "./env";

const API_URL = requireEnv("VITE_API_URL");

const CLIENT_PLATFORM_HEADER = { "X-Client-Platform": "web" } as const;

function formatApiError(json: unknown, status: number): string {
  if (json == null || typeof json !== "object") return `HTTP ${status}`;
  const rec = json as Record<string, unknown>;
  const err = rec.error;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const parts: string[] = [];
    for (const [key, val] of Object.entries(err as Record<string, unknown>)) {
      if (Array.isArray(val)) parts.push(`${key}: ${val.join(", ")}`);
      else if (val != null) parts.push(`${key}: ${String(val)}`);
    }
    if (parts.length > 0) return parts.join(" · ");
  }
  return `HTTP ${status}`;
}

export async function apiPost(path: string, token: string, body?: unknown) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...CLIENT_PLATFORM_HEADER,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(formatApiError(json, res.status));
  return json;
}

export async function apiGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}`, ...CLIENT_PLATFORM_HEADER },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json as T;
}

export async function apiPatch(path: string, token: string, body?: unknown) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...CLIENT_PLATFORM_HEADER,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json;
}

export async function apiDelete(path: string, token: string) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, ...CLIENT_PLATFORM_HEADER },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json;
}

