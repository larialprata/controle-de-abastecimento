const ABAST_QR_TIPOS = new Set(["EQUIPAMENTO", "MELOSA", "TANQUE"]);

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

  return text;
}

/** Extrai ativo de QR interno CONTROLE_ABAST (fallback local). */
export function parseAbastEquipamentoQrAtivo(raw: string): string | null {
  const text = normalizeEquipamentoQrScan(raw);
  const match = text.match(/^CONTROLE_ABAST:(.+)$/i);
  if (!match?.[1]) return null;

  const body = match[1].trim();
  if (!body) return null;

  const segments = body.split(":");
  const maybeTipo = segments[0]?.trim().toUpperCase() ?? "";

  if (ABAST_QR_TIPOS.has(maybeTipo) && segments.length >= 2) {
    const ativo = segments.slice(1).join(":").trim();
    return ativo || null;
  }

  if (segments.length === 1) {
    return body;
  }

  return null;
}
