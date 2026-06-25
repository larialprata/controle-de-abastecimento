import QRCode from "qrcode";

export const EQUIPAMENTO_QR_LOGO_SRC = "/dimensional-logo.png";

export function getEquipamentosPublicBaseUrl(): string {
  return (
    import.meta.env.VITE_EQUIPAMENTOS_PUBLIC_BASE_URL?.trim() ||
    import.meta.env.VITE_EQUIPAMENTOS_QR_PUBLIC_BASE_URL?.trim() ||
    ""
  ).replace(/\/+$/, "");
}

/** URL pública do Controle de Equipamentos: /q/{token} */
export function buildEquipamentoMovementQrUrl(qrValue: string): string {
  const token = qrValue.trim();
  const base = getEquipamentosPublicBaseUrl();
  if (!base) return token;
  return `${base}/q/${encodeURIComponent(token)}`;
}

export function extractEquipamentoQrValue(raw: string): string {
  const normalized = raw.trim();
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

export function qrImageContentFromResolved(qrContent: string): string {
  const trimmed = qrContent.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("CONTROLE_ABAST:")) return trimmed;
  return buildEquipamentoMovementQrUrl(trimmed);
}

type QrImageOptions = {
  width?: number;
  margin?: number;
  logoScale?: number;
  logoSrc?: string;
};

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Falha ao carregar imagem: ${src}`));
    img.src = src;
  });

/** QR com logo centralizada (correção H), igual ao Controle de Equipamentos. */
export async function buildEquipamentoQrDataUrlWithLogo(
  content: string,
  options: QrImageOptions = {},
): Promise<string> {
  const width = options.width ?? 280;
  const margin = options.margin ?? 1;
  const logoScale = options.logoScale ?? 0.24;
  const logoSrc = options.logoSrc ?? EQUIPAMENTO_QR_LOGO_SRC;

  const qrDataUrl = await QRCode.toDataURL(content, {
    width,
    margin,
    errorCorrectionLevel: "H",
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = width;
  const ctx = canvas.getContext("2d");
  if (!ctx) return qrDataUrl;

  const qrImg = await loadImage(qrDataUrl);
  ctx.drawImage(qrImg, 0, 0, width, width);

  try {
    const logoImg = await loadImage(logoSrc);
    const logoSize = Math.round(width * logoScale);
    const x = (width - logoSize) / 2;
    const y = (width - logoSize) / 2;
    const pad = Math.max(4, Math.round(logoSize * 0.14));

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x - pad, y - pad, logoSize + pad * 2, logoSize + pad * 2);
    ctx.drawImage(logoImg, x, y, logoSize, logoSize);
  } catch {
    // Sem logo: retorna só o QR.
  }

  return canvas.toDataURL("image/png");
}
