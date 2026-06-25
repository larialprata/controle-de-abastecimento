const ABAST_QR_TIPOS = new Set(["EQUIPAMENTO", "MELOSA", "TANQUE"]);

function ensureQrUrlScheme(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z0-9.-]+\/q\//i.test(trimmed) || /^\/q\//i.test(trimmed)) {
    return `https://${trimmed.replace(/^\/+/, "")}`;
  }
  return trimmed;
}

/** Normaliza o texto lido pelo scanner antes de enviar à API. */
export function normalizeEquipamentoQrScan(raw: string): string {
  let text = raw.trim().replace(/^\uFEFF/, "");
  if (!text) return "";

  if (/%[0-9A-Fa-f]{2}/.test(text)) {
    try {
      const decoded = decodeURIComponent(text).trim().replace(/^\uFEFF/, "");
      if (decoded) text = decoded;
    } catch {
      // mantém o texto original
    }
  }

  return ensureQrUrlScheme(text);
}

/** Extrai token/UUID de URL do Controle de Equipamentos (/q/{token}). */
export function extractEquipamentoQrValue(raw: string): string {
  const normalized = normalizeEquipamentoQrScan(raw);
  if (!normalized) return "";

  const queryMatch = normalized.match(/[?&]qr=([^&#]+)/i);
  if (queryMatch?.[1]) {
    return decodeURIComponent(queryMatch[1]).trim();
  }

  const shortPathMatch = normalized.match(/(?:^|\/)q\/([^/?#]+)/i);
  if (shortPathMatch?.[1]) {
    return decodeURIComponent(shortPathMatch[1]).trim();
  }

  return normalized;
}

export function parseEquipamentoQrContent(
  raw: string,
): { kind: "abast"; ativo: string } | { kind: "token"; token: string } | null {
  const text = normalizeEquipamentoQrScan(raw);
  if (!text) return null;

  const abast = parseAbastEquipamentoQrContent(text);
  if (abast) return abast;

  const token = extractEquipamentoQrValue(text);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return { kind: "token", token };
  }

  const pathToken = text.match(/(?:^|\/)q\/([^/?#]+)/i)?.[1];
  if (pathToken?.trim()) {
    return { kind: "token", token: decodeURIComponent(pathToken).trim() };
  }

  return null;
}

function parseAbastEquipamentoQrContent(
  text: string,
): { kind: "abast"; ativo: string } | null {
  const match = text.match(/^CONTROLE_ABAST:(.+)$/i);
  if (!match?.[1]) return null;

  const body = match[1].trim();
  if (!body) return null;

  const segments = body.split(":");
  const maybeTipo = segments[0]?.trim().toUpperCase() ?? "";

  if (ABAST_QR_TIPOS.has(maybeTipo) && segments.length >= 2) {
    const ativo = segments.slice(1).join(":").trim();
    if (ativo) return { kind: "abast", ativo };
  }

  if (segments.length === 1) {
    return { kind: "abast", ativo: body };
  }

  return null;
}

/** Extrai ativo de QR interno CONTROLE_ABAST (fallback local). */
export function parseAbastEquipamentoQrAtivo(raw: string): string | null {
  const parsed = parseAbastEquipamentoQrContent(normalizeEquipamentoQrScan(raw));
  return parsed?.kind === "abast" ? parsed.ativo : null;
}

/** Monta o valor a enviar para POST /v1/equipamentos/qr/lookup. */
export function buildEquipamentoQrLookupPayload(raw: string): string {
  return normalizeEquipamentoQrScan(raw) || raw.trim();
}
