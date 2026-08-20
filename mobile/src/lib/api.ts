import { requireEnv } from "./env";

function resolveApiBaseUrl(rawApiUrl: string): string {
  const trimmed = rawApiUrl.trim();
  if (!trimmed) return trimmed;

  const shouldForceHttp =
    /^https:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?(\/|$)/i.test(
      trimmed
    ) || /^https:\/\/\d{1,3}(?:\.\d{1,3}){3}(:\d+)?(\/|$)/i.test(trimmed);

  const normalized = shouldForceHttp ? trimmed.replace(/^https:\/\//i, "http://") : trimmed;
  return normalized.replace(/\/+$/, "");
}

const API_URL = resolveApiBaseUrl(requireEnv("API_URL"));
const DEFAULT_FETCH_TIMEOUT_MS = 20000;

type ApiPostContext = Record<string, unknown> & {
  operation_id?: string;
  tipo?: string;
  action?: string;
};

function errorToMessage(err: any): string {
  if (typeof err === "string") return err;
  if (err?.message && typeof err.message === "string") return err.message;
  if (err?.name && typeof err.name === "string") {
    const name = err.name;
    if (name !== "Error") return `${name}`;
  }
  if (typeof err?.toString === "function") {
    const s = err.toString();
    if (s && s !== "[object Object]") return s;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return "Erro desconhecido (objeto)";
  }
}

function buildErrorMeta(err: any) {
  const errType = typeof err;
  const name = err?.name;
  const message = err?.message;
  const stack = err?.stack;
  const toString = typeof err?.toString === "function" ? err.toString() : undefined;
  const keys = err && errType === "object" ? Object.keys(err) : undefined;

  return {
    errType,
    name: typeof name === "string" ? name : undefined,
    messageType: err?.message ? typeof err.message : undefined,
    message,
    stack: typeof stack === "string" ? stack : undefined,
    toString,
    keys,
  };
}

function isAbortError(err: any): boolean {
  return err?.name === "AbortError";
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...(init ?? {}), signal: controller.signal });
  } catch (err: any) {
    if (isAbortError(err)) {
      throw new Error(`Tempo limite de rede excedido (${Math.round(timeoutMs / 1000)}s).`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function reportMobileError(payload: {
  kind: string;
  message: string;
  stack?: string;
  at?: string;
  path?: string;
  status?: number;
  meta?: Record<string, unknown>;
} & ApiPostContext) {
  try {
    await fetchWithTimeout(`${API_URL}/v1/debug/mobile-error`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: payload.kind,
        message: payload.message,
        stack: payload.stack,
        at: payload.at ?? new Date().toISOString(),
        path: payload.path,
        status: payload.status,
        operation_id: payload.operation_id,
        tipo: payload.tipo,
        action: payload.action,
        meta: payload.meta,
      }),
    });
  } catch {
  }
}

export async function apiPost<TResponse = any>(
  path: string,
  token: string,
  body?: unknown,
  context?: ApiPostContext,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS
) {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${API_URL}${path}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Client-Platform": "app",
        },
        body: body ? JSON.stringify(body) : undefined,
      },
      timeoutMs
    );
  } catch (err: any) {
    const msg = errorToMessage(err);
    const meta = buildErrorMeta(err);
    await reportMobileError({
      kind: "api_network_error",
      message: msg,
      path,
      stack: typeof err?.stack === "string" ? err.stack : undefined,
      meta,
      ...(context ?? {}),
    });
    throw new Error(msg);
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const raw = json?.error;
    const msg =
      typeof raw === "string"
        ? raw
        : typeof raw?.message === "string"
          ? raw.message
          : raw === undefined
            ? `HTTP ${res.status}`
            : (() => {
                try {
                  return JSON.stringify(raw);
                } catch {
                  return `HTTP ${res.status}`;
                }
              })();

    await reportMobileError({
      kind: "api_http_error",
      message: msg,
      path,
      status: res.status,
      ...(context ?? {}),
    });
    throw new Error(msg);
  }

  return json as TResponse;
}

export async function registerCredentials(email: string, password: string) {
  const res = await fetchWithTimeout(`${API_URL}/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const raw = json?.error;
    const msg =
      typeof raw === "string"
        ? raw
        : raw === undefined
          ? `HTTP ${res.status}`
          : (() => {
              try {
                return JSON.stringify(raw);
              } catch {
                return `HTTP ${res.status}`;
              }
            })();
    throw new Error(msg);
  }
  return json as { ok: boolean; user_id: string };
}

export async function finishEmailSignupAfterRegister(email: string, password: string) {
  const res = await fetchWithTimeout(`${API_URL}/v1/auth/finish-email-signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const raw = json?.error;
    const msg =
      typeof raw === "string"
        ? raw
        : raw === undefined
          ? `HTTP ${res.status}`
          : (() => {
              try {
                return JSON.stringify(raw);
              } catch {
                return `HTTP ${res.status}`;
              }
            })();
    throw new Error(msg);
  }
  return json as { ok: boolean };
}

export async function apiGet<TResponse = any>(path: string, token: string) {
  const res = await fetchWithTimeout(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "X-Client-Platform": "app" },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json as TResponse;
}

