import {
  buildEquipamentoQrDataUrlWithLogo,
  extractEquipamentoQrValue,
  qrImageContentFromResolved,
} from "./equipamentoMovementQr";

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
  return buildEquipamentoQrDataUrlWithLogo(qrImageContentFromResolved(content), {
    width: 320,
    margin: 1,
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
  company_name?: string | null;
  contract_name?: string | null;
  qr_token?: string | null;
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
      const ativoLabel = item.ativo;
      const nome = item.nome && item.nome !== ativoLabel ? item.nome : "";
      const qrValue = item.qr_token ?? extractEquipamentoQrValue(content) ?? content;
      const meta = [
        item.company_name?.trim() ? `Empresa: ${item.company_name.trim()}` : null,
        item.contract_name?.trim() ? `Contrato: ${item.contract_name.trim()}` : null,
      ]
        .filter(Boolean)
        .map((line) => `<p class="print-qr-meta">${escapeHtml(line!)}</p>`)
        .join("");

      return `
        <article class="print-qr-card">
          <p class="print-qr-label">QR para movimentações</p>
          <h2 class="print-qr-title">${escapeHtml(ativoLabel)}</h2>
          ${nome ? `<p class="print-qr-subtitle">${escapeHtml(nome)}</p>` : ""}
          ${meta}
          <div class="print-qr-frame">
            <img class="print-qr-image" src="${dataUrl}" alt="QR ${escapeHtml(ativoLabel)}" />
          </div>
          <p class="print-qr-code">Código vinculado: ${escapeHtml(qrValue)}</p>
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
    @page { size: A4; margin: 10mm; }
    body { font-family: system-ui, sans-serif; margin: 24px; color: #111827; background: #f3f4f6; }
    h1 { font-size: 1.25rem; margin-bottom: 8px; }
    .meta { color: #64748b; font-size: 0.875rem; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(105mm, 1fr)); gap: 20px; }
    .print-qr-card {
      width: 105mm; max-width: 100%; margin: 0 auto; border: 1px solid #d1d5db;
      border-radius: 16px; background: #fff; padding: 16px; text-align: center; break-inside: avoid;
    }
    .print-qr-label { font-size: 10px; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; color: #6b7280; }
    .print-qr-title { font-size: 1.25rem; font-weight: 700; margin: 8px 0 0; }
    .print-qr-subtitle, .print-qr-meta, .print-qr-code { font-size: 0.875rem; color: #4b5563; margin: 4px 0 0; }
    .print-qr-frame { margin-top: 16px; padding: 12px; border: 1px dashed #d1d5db; border-radius: 12px; background: #f9fafb; }
    .print-qr-image { width: 160px; height: 160px; border-radius: 8px; }
    @media print {
      body { margin: 0; background: #fff; }
      .meta { display: none; }
      .print-qr-card { border-radius: 4mm; box-shadow: none; page-break-inside: avoid; }
      .print-qr-image { width: 62mm; height: 62mm; }
      .print-qr-title { font-size: 11pt; }
      .print-qr-subtitle, .print-qr-meta, .print-qr-code { font-size: 8pt; }
      .print-qr-label { font-size: 7pt; }
    }
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
