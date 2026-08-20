import { envValidated } from "../../config";
import type { ObjectStorage, StorageUploadOptions } from "./types";
import { isMonthOrganizedStoragePath } from "./photoNaming";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

type TokenCache = { accessToken: string; expiresAtMs: number };
type DriveCache = { driveId: string };

let tokenCache: TokenCache | null = null;
let driveCache: DriveCache | null = null;

function normalizePath(storagePath: string): string {
  return storagePath.trim().replace(/^\/+/, "");
}

function encodeGraphPath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function joinPath(...parts: string[]): string {
  return parts
    .map((p) => p.trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

function resolveSharePointRelativePath(bucket: string, path: string): string {
  const storagePath = normalizePath(path);
  const cnhBucket = envValidated.CNH_BUCKET;
  if (bucket === cnhBucket || bucket === "cnh") {
    // CNH: pasta dedicada; se já veio organizada por mês, não duplica
    return joinPath(envValidated.SHAREPOINT_FOLDER_CNH, storagePath);
  }
  // Paths novos: YYYY-MM/ativo-data-fase-kind.ext → direto sob pasta de operação
  if (isMonthOrganizedStoragePath(storagePath)) {
    return joinPath(envValidated.SHAREPOINT_FOLDER_OPERATION, storagePath);
  }
  // Legado: combustível/{bucket}/{userId}/...
  return joinPath(envValidated.SHAREPOINT_FOLDER_OPERATION, bucket, storagePath);
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAtMs > now + 60_000) {
    return tokenCache.accessToken;
  }

  const body = new URLSearchParams({
    client_id: envValidated.SHAREPOINT_CLIENT_ID,
    client_secret: envValidated.SHAREPOINT_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${envValidated.SHAREPOINT_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      `Falha ao obter token Graph: ${json.error_description ?? json.error ?? res.status}`,
    );
  }

  const expiresIn = Number(json.expires_in ?? 3600);
  tokenCache = {
    accessToken: json.access_token,
    expiresAtMs: now + expiresIn * 1000,
  };
  return tokenCache.accessToken;
}

async function graphFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${GRAPH_BASE}${path}`, { ...init, headers });
}

async function getDriveId(): Promise<string> {
  if (driveCache?.driveId) return driveCache.driveId;

  const siteId = encodeURIComponent(envValidated.SHAREPOINT_SITE_ID);
  const res = await graphFetch(`/sites/${siteId}/drive`);
  const json = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!res.ok || !json.id) {
    throw new Error(json.error?.message ?? `Falha ao obter drive do site (${res.status})`);
  }
  driveCache = { driveId: json.id };
  return json.id;
}

function itemByPathUrl(driveId: string, relativePath: string): string {
  const encoded = encodeGraphPath(relativePath);
  return `/drives/${driveId}/root:/${encoded}`;
}

export function createSharePointObjectStorage(): ObjectStorage {
  return {
    async upload(bucket, path, data, options) {
      const relativePath = resolveSharePointRelativePath(bucket, path);
      const driveId = await getDriveId();
      const contentType = options?.contentType || "application/octet-stream";
      const res = await graphFetch(`${itemByPathUrl(driveId, relativePath)}:/content`, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: new Uint8Array(data),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(err.error?.message ?? `Falha no upload SharePoint (${res.status})`);
      }
    },

    async exists(bucket, path) {
      const relativePath = resolveSharePointRelativePath(bucket, path);
      if (!normalizePath(path)) return false;
      try {
        const driveId = await getDriveId();
        const res = await graphFetch(`${itemByPathUrl(driveId, relativePath)}?$select=id`);
        return res.ok;
      } catch (err) {
        console.warn("[sharepoint.exists]", bucket, path, err instanceof Error ? err.message : err);
        return false;
      }
    },

    async download(bucket, path) {
      const relativePath = resolveSharePointRelativePath(bucket, path);
      const driveId = await getDriveId();
      const res = await graphFetch(`${itemByPathUrl(driveId, relativePath)}:/content`);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(err.error?.message ?? `Arquivo não encontrado no SharePoint (${res.status})`);
      }
      return Buffer.from(await res.arrayBuffer());
    },

    async createSignedUrl(bucket, path, _expiresInSeconds) {
      const relativePath = resolveSharePointRelativePath(bucket, path);
      const driveId = await getDriveId();
      const res = await graphFetch(itemByPathUrl(driveId, relativePath));
      const json = (await res.json().catch(() => ({}))) as {
        "@microsoft.graph.downloadUrl"?: string;
        error?: { message?: string };
      };
      if (!res.ok || !json["@microsoft.graph.downloadUrl"]) {
        throw new Error(json.error?.message ?? `Não foi possível gerar URL temporária (${res.status})`);
      }
      return json["@microsoft.graph.downloadUrl"];
    },
  };
}

export { resolveSharePointRelativePath };
