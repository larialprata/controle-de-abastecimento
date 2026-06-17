export type EquipamentoQrTipo = "EQUIPAMENTO" | "MELOSA";

export const EQUIPAMENTO_QR_PREFIX = "CONTROLE_ABAST";

/** Conteúdo do QR para leitura no app mobile. Formato: CONTROLE_ABAST:EQUIPAMENTO:ATIVO */
export function buildEquipamentoQrPayload(
  ativo: string,
  tipo: EquipamentoQrTipo = "EQUIPAMENTO",
): string {
  return `${EQUIPAMENTO_QR_PREFIX}:${tipo}:${ativo.trim()}`;
}

export function parseEquipamentoQrPayload(raw: string): { tipo: EquipamentoQrTipo; ativo: string } | null {
  const text = raw.trim().replace(/^\uFEFF/, "");
  const match = text.match(/^CONTROLE_ABAST:(.+)$/i);
  if (!match?.[1]) return null;

  const body = match[1].trim();
  const segments = body.split(":");
  const maybeTipo = segments[0]?.trim().toUpperCase() ?? "";

  if ((maybeTipo === "EQUIPAMENTO" || maybeTipo === "MELOSA") && segments.length >= 2) {
    const ativo = segments.slice(1).join(":").trim();
    if (!ativo) return null;
    return { tipo: maybeTipo as EquipamentoQrTipo, ativo };
  }

  if (segments.length === 1 && body) {
    return { tipo: "EQUIPAMENTO", ativo: body };
  }

  return null;
}

export async function equipamentoQrDataUrl(
  ativo: string,
  tipo: EquipamentoQrTipo = "EQUIPAMENTO",
): Promise<string> {
  return qrDataUrlFromContent(buildEquipamentoQrPayload(ativo, tipo));
}

export async function qrDataUrlFromContent(content: string): Promise<string> {
  const QRCode = await import("qrcode");
  return QRCode.toDataURL(content, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320,
  });
}

export function downloadQrPng(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export type EquipamentoQrItem = {
  ativo: string;
  nome: string | null;
  tipo?: EquipamentoQrTipo;
  qr_content?: string;
  source?: "externo" | "abast";
};

export async function downloadEquipamentosQrHtml(
  itens: EquipamentoQrItem[],
  titulo = "QR codes — equipamentos",
): Promise<void> {
  if (itens.length === 0) return;

  const cards = await Promise.all(
    itens.map(async (item) => {
      const tipo = item.tipo ?? "EQUIPAMENTO";
      const content = item.qr_content ?? buildEquipamentoQrPayload(item.ativo, tipo);
      const dataUrl = await qrDataUrlFromContent(content);
      const nome = item.nome && item.nome !== item.ativo ? item.nome : "";
      const origem =
        item.source === "externo"
          ? '<p class="origem">Controle de Equipamentos</p>'
          : item.source === "abast"
            ? '<p class="origem">Controle Abast</p>'
            : "";
      return `
        <article class="card">
          <img src="${dataUrl}" alt="QR ${item.ativo}" width="200" height="200" />
          <p class="ativo">${escapeHtml(item.ativo)}</p>
          ${nome ? `<p class="nome">${escapeHtml(nome)}</p>` : ""}
          ${origem}
        </article>
      `;
    }),
  );

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(titulo)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; color: #0f172a; }
    h1 { font-size: 1.25rem; margin-bottom: 8px; }
    .meta { color: #64748b; font-size: 0.875rem; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 20px; }
    .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; text-align: center; break-inside: avoid; }
    .ativo { font-family: ui-monospace, monospace; font-weight: 700; margin: 12px 0 4px; }
    .nome { font-size: 0.8rem; color: #475569; margin: 0; }
    .origem { font-size: 0.7rem; color: #94a3b8; margin: 8px 0 0; }
    @media print { body { margin: 12px; } .card { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(titulo)}</h1>
  <p class="meta">${itens.length} equipamento(s) · imprima ou guarde como PDF pelo navegador</p>
  <div class="grid">${cards.join("")}</div>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "qr-codes-equipamentos.html";
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
