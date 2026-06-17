import { useCallback, useEffect, useState } from "react";
import { Download, Printer, X } from "lucide-react";
import type { CadastroAtivoTipo } from "./CadastroAtivosPage";
import { downloadQrPng, qrDataUrlFromContent } from "../../lib/equipamentoQrCode";
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

export default function EquipamentoQrModal({
  ativo,
  nome,
  tipo,
  obraCodigo,
  token,
  onClose,
}: EquipamentoQrModalProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [resolved, setResolved] = useState<EquipamentoQrResolved | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const label = nome && nome !== ativo ? nome : ativo;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResolved(null);
    void resolveEquipamentoQr(token, ativo, obraCodigo)
      .then(async (qr) => {
        if (cancelled) return;
        setResolved(qr);
        const url = await qrDataUrlFromContent(qr.qr_content);
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

  const handleDownload = useCallback(() => {
    if (!dataUrl) return;
    const safe = ativo.replace(/[^\w.-]+/g, "_");
    downloadQrPng(dataUrl, `qr-${safe}.png`);
  }, [ativo, dataUrl]);

  const handlePrint = useCallback(() => {
    if (!dataUrl) return;
    const w = window.open("", "_blank", "noopener,noreferrer,width=480,height=640");
    if (!w) return;
    const origem =
      resolved?.source === "externo"
        ? "Controle de Equipamentos"
        : resolved?.source === "abast"
          ? "Controle Abast"
          : "";
    w.document.write(`<!DOCTYPE html><html><head><title>QR ${ativo}</title>
      <style>body{font-family:system-ui,sans-serif;text-align:center;padding:32px}
      img{width:280px;height:280px}.ativo{font-family:monospace;font-size:1.25rem;font-weight:700;margin-top:16px}
      .nome{color:#475569;margin-top:8px}.origem{color:#94a3b8;font-size:0.75rem;margin-top:12px}</style></head><body>
      <img src="${dataUrl}" alt="QR" />
      <p class="ativo">${ativo}</p>
      ${nome && nome !== ativo ? `<p class="nome">${nome}</p>` : ""}
      ${origem ? `<p class="origem">${origem}</p>` : ""}
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }, [ativo, dataUrl, nome, resolved?.source]);

  const payload = resolved?.qr_content ?? "";

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
      <div className={`w-full max-w-sm rounded-2xl p-6 shadow-xl ${glassPanel}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="equipamento-qr-title" className="text-lg font-bold text-slate-900 dark:text-white">
              QR code do equipamento
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{label}</p>
            {resolved?.source === "externo" ? (
              <p className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                QR do Controle de Equipamentos
              </p>
            ) : resolved?.source === "abast" ? (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">QR interno (Controle Abast)</p>
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

        <div className="mt-5 flex flex-col items-center">
          {loading ? (
            <div className="flex h-[280px] w-[280px] items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-500 dark:bg-white/5">
              A gerar QR…
            </div>
          ) : error ? (
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>
          ) : dataUrl ? (
            <img
              src={dataUrl}
              alt={`QR code do equipamento ${ativo}`}
              className="h-[280px] w-[280px] rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10"
            />
          ) : null}

          <p className="mt-4 font-mono text-base font-bold text-slate-900 dark:text-white">{ativo}</p>
          {payload ? (
            <p className="mt-2 max-w-full break-all text-center text-xs text-slate-500 dark:text-slate-400">
              {payload}
            </p>
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
