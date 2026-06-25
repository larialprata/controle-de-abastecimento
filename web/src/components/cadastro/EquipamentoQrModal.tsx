import { useCallback, useEffect, useState } from "react";
import { Download, Printer, X } from "lucide-react";
import type { CadastroAtivoTipo } from "./CadastroAtivosPage";
import EquipamentoQrPrintCard from "./EquipamentoQrPrintCard";
import { downloadQrPng } from "../../lib/equipamentoQrCode";
import {
  buildEquipamentoQrDataUrlWithLogo,
  extractEquipamentoQrValue,
  qrImageContentFromResolved,
} from "../../lib/equipamentoMovementQr";
import { resolveEquipamentoQr, type EquipamentoQrResolved } from "../../lib/equipamentoQrResolve";
import { glassPanel } from "../../lib/glass";

export type EquipamentoQrModalProps = {
  ativo: string;
  nome: string | null;
  tipo: CadastroAtivoTipo;
  obraCodigo?: number | null;
  token: string;
  onClose: () => void;
};

function printFieldsFromResolved(
  ativo: string,
  nome: string | null,
  resolved: EquipamentoQrResolved | null,
) {
  const externo = resolved?.externo;
  const ativoLabel = externo?.ativo_placa?.trim() || ativo;
  const equipmentName =
    (nome && nome !== ativo ? nome : null) ??
    externo?.name?.trim() ??
    (resolved?.nome && resolved.nome !== ativoLabel ? resolved.nome : null);
  const companyName = externo?.company_name ?? null;
  const contractName = externo?.contract_name ?? null;
  const qrValue = externo?.qr_token ?? extractEquipamentoQrValue(resolved?.qr_content ?? "");
  return { ativoLabel, equipmentName, companyName, contractName, qrValue };
}

export default function EquipamentoQrModal({
  ativo,
  nome,
  obraCodigo,
  token,
  onClose,
}: EquipamentoQrModalProps) {
  const [resolved, setResolved] = useState<EquipamentoQrResolved | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResolved(null);
    setDataUrl(null);

    void resolveEquipamentoQr(token, ativo, obraCodigo)
      .then(async (qr) => {
        if (cancelled) return;
        setResolved(qr);
        const content = qrImageContentFromResolved(qr.qr_content);
        const url = await buildEquipamentoQrDataUrlWithLogo(content, { width: 280, margin: 1 });
        if (!cancelled) setDataUrl(url);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erro ao gerar QR code.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ativo, obraCodigo, token]);

  const { ativoLabel, equipmentName, companyName, contractName, qrValue } = printFieldsFromResolved(
    ativo,
    nome,
    resolved,
  );

  const handleDownload = useCallback(() => {
    if (!dataUrl) return;
    const safe = ativoLabel.replace(/[^\w.-]+/g, "_");
    downloadQrPng(dataUrl, `qr-${safe}.png`);
  }, [ativoLabel, dataUrl]);

  const handlePrint = useCallback(() => {
    if (!resolved?.qr_content) return;
    const w = window.open("", "_blank", "noopener,noreferrer,width=520,height=760");
    if (!w) return;

    const metaHtml = [
      companyName ? `<p class="print-qr-meta">Empresa: ${escapeHtml(companyName)}</p>` : "",
      contractName ? `<p class="print-qr-meta">Contrato: ${escapeHtml(contractName)}</p>` : "",
    ].join("");

    w.document.write(`<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8" /><title>QR ${escapeHtml(ativoLabel)}</title>
<style>
  @page { size: A4; margin: 10mm; }
  body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; color: #111827; background: #f3f4f6; }
  .print-qr-card { width: 105mm; margin: 0 auto; border: 1px solid #d1d5db; border-radius: 16px; background: #fff; padding: 16px; text-align: center; }
  .print-qr-label { font-size: 10px; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; color: #6b7280; }
  .print-qr-title { font-size: 1.25rem; font-weight: 700; margin: 8px 0 0; }
  .print-qr-subtitle, .print-qr-meta, .print-qr-code { font-size: 0.875rem; color: #4b5563; margin: 4px 0 0; }
  .print-qr-frame { margin-top: 16px; padding: 12px; border: 1px dashed #d1d5db; border-radius: 12px; background: #f9fafb; }
  .print-qr-image { width: 160px; height: 160px; }
  .print-qr-note { display: none; }
  @media print {
    body { background: #fff; padding: 0; }
    .print-qr-card { border-radius: 4mm; box-shadow: none; }
    .print-qr-image { width: 62mm; height: 62mm; }
    .print-qr-title { font-size: 11pt; }
    .print-qr-subtitle, .print-qr-meta, .print-qr-code { font-size: 8pt; }
    .print-qr-label { font-size: 7pt; }
  }
</style></head><body>
  <div class="print-qr-card">
    <p class="print-qr-label">QR para movimentações</p>
    <h1 class="print-qr-title">${escapeHtml(ativoLabel)}</h1>
    ${equipmentName ? `<p class="print-qr-subtitle">${escapeHtml(equipmentName)}</p>` : ""}
    ${metaHtml}
    <div class="print-qr-frame">
      <img class="print-qr-image" src="${dataUrl ?? ""}" alt="QR" />
    </div>
    <p class="print-qr-code">Código vinculado: ${escapeHtml(qrValue || "—")}</p>
  </div>
</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }, [ativoLabel, companyName, contractName, dataUrl, equipmentName, qrValue, resolved?.qr_content]);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="equipamento-qr-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`w-full max-w-md rounded-2xl p-6 shadow-xl ${glassPanel}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="equipamento-qr-title" className="text-lg font-bold text-slate-900 dark:text-white">
              QR code do equipamento
            </h2>
            {resolved?.source === "externo" ? (
              <p className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                Dados do Controle de Equipamentos
              </p>
            ) : resolved?.source === "abast" ? (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Equipamento só no Controle Abast (QR interno)
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-white/10"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="mt-5">
          {loading ? (
            <div className="flex h-[320px] items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-500 dark:bg-white/5">
              A carregar dados do equipamento…
            </div>
          ) : error ? (
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>
          ) : resolved ? (
            <EquipamentoQrPrintCard
              ativo={ativoLabel}
              equipmentName={equipmentName}
              companyName={companyName}
              contractName={contractName}
              qrContent={resolved.qr_content}
              qrValueLabel={qrValue}
            />
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 dark:border-white/20 dark:bg-black/20 dark:text-slate-100"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!dataUrl}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 disabled:opacity-50 dark:border-white/20 dark:bg-black/20 dark:text-slate-100"
          >
            <Printer className="h-4 w-4" aria-hidden />
            Imprimir
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!dataUrl}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden />
            Baixar PNG
          </button>
        </div>
      </div>
    </div>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
