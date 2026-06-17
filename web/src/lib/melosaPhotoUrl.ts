import { requireEnv } from "./env";
import { normalizeSignatureImageSrc } from "./signatureImageNormalize";

const API_URL = requireEnv("VITE_API_URL");

async function fetchMelosaPhotoJson<T>(path: string, token: string): Promise<T | null> {
  if (!token?.trim()) return null;
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Client-Platform": "web",
      },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) {
      console.warn("[melosa photo]", path, json?.error ?? res.status);
      return null;
    }
    return json;
  } catch (err) {
    console.warn("[melosa photo]", path, err);
    return null;
  }
}

export async function fetchMelosaPhotoSignedUrl(token: string, storagePath: string): Promise<string | null> {
  const path = storagePath.trim();
  if (!path) return null;
  const json = await fetchMelosaPhotoJson<{ url?: string }>(
    `/v1/melosa/photo-url?path=${encodeURIComponent(path)}`,
    token,
  );
  return typeof json?.url === "string" && json.url.trim() ? json.url.trim() : null;
}

export async function fetchMelosaPhotoDataUrl(token: string, storagePath: string): Promise<string | null> {
  const path = storagePath.trim();
  if (!path) return null;
  const json = await fetchMelosaPhotoJson<{ dataUrl?: string }>(
    `/v1/melosa/photo-data?path=${encodeURIComponent(path)}`,
    token,
  );
  return typeof json?.dataUrl === "string" && json.dataUrl.startsWith("data:image/")
    ? json.dataUrl
    : null;
}


async function fetchMelosaPhotoForTicket(token: string, storagePath: string): Promise<string | null> {
  const dataUrl = await fetchMelosaPhotoDataUrl(token, storagePath);
  if (dataUrl) return dataUrl;
  return fetchMelosaPhotoSignedUrl(token, storagePath);
}

async function toDataUrlIfNeeded(src: string): Promise<string> {
  if (src.startsWith("data:image/")) return src;
  const res = await fetch(src, { cache: "no-store" });
  if (!res.ok) return src;
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : src);
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

export async function fetchMelosaSignatureForTicket(token: string, storagePath: string): Promise<string | null> {
  const raw = await fetchMelosaPhotoForTicket(token, storagePath);
  if (!raw) return null;
  try {
    const dataUrl = await toDataUrlIfNeeded(raw);
    return await normalizeSignatureImageSrc(dataUrl);
  } catch {
    return raw;
  }
}

export async function enrichMelosaTicketRowsWithSignatures<
  T extends {
    assinaturaMotoristaPath?: string | null;
    assinaturaOperadorPath?: string | null;
    assinaturaMotoristaUrl?: string | null;
    assinaturaOperadorUrl?: string | null;
  },
>(token: string, rows: T[]): Promise<T[]> {
  return Promise.all(
    rows.map(async (row) => {
      const [motoristaUrl, operadorUrl] = await Promise.all([
        row.assinaturaMotoristaPath?.trim()
          ? fetchMelosaSignatureForTicket(token, row.assinaturaMotoristaPath)
          : Promise.resolve(row.assinaturaMotoristaUrl ?? null),
        row.assinaturaOperadorPath?.trim()
          ? fetchMelosaSignatureForTicket(token, row.assinaturaOperadorPath)
          : Promise.resolve(row.assinaturaOperadorUrl ?? null),
      ]);
      return {
        ...row,
        assinaturaMotoristaUrl: motoristaUrl,
        assinaturaOperadorUrl: operadorUrl,
      };
    }),
  );
}
