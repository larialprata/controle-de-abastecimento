import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  buildEquipamentoQrDataUrlWithLogo,
  extractEquipamentoQrValue,
  qrImageContentFromResolved,
} from "../../lib/equipamentoMovementQr";

export type EquipamentoQrPrintCardProps = {
  ativo: string;
  equipmentName?: string | null;
  companyName?: string | null;
  contractName?: string | null;
  qrContent: string;
  qrValueLabel?: string;
  compact?: boolean;
};

export default function EquipamentoQrPrintCard({
  ativo,
  equipmentName,
  companyName,
  contractName,
  qrContent,
  qrValueLabel,
  compact = false,
}: EquipamentoQrPrintCardProps) {
  const [src, setSrc] = useState("");
  const [error, setError] = useState<string | null>(null);

  const qrValue = qrValueLabel ?? extractEquipamentoQrValue(qrContent) ?? qrContent;
  const subtitle = equipmentName?.trim() && equipmentName.trim() !== ativo ? equipmentName.trim() : "";
  const metaLines = [
    companyName?.trim() ? `Empresa: ${companyName.trim()}` : null,
    contractName?.trim() ? `Contrato: ${contractName.trim()}` : null,
  ].filter(Boolean) as string[];

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setSrc("");

    const content = qrImageContentFromResolved(qrContent);
    if (!content) {
      setError("Conteúdo do QR inválido.");
      return () => {
        cancelled = true;
      };
    }

    void buildEquipamentoQrDataUrlWithLogo(content, {
      width: compact ? 256 : 280,
      margin: compact ? 2 : 1,
    })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erro ao gerar QR.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [compact, qrContent]);

  return (
    <div className="print-qr-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/40">
      <div className="flex flex-col items-center text-center">
        <p className="print-qr-label text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
          QR para movimentações
        </p>
        <h3 className="print-qr-title mt-2 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          {ativo || "Ativo não informado"}
        </h3>
        {subtitle ? (
          <p className="print-qr-subtitle mt-1 text-sm text-slate-600 dark:text-slate-300">{subtitle}</p>
        ) : null}
        {metaLines.map((line) => (
          <p key={line} className="print-qr-meta mt-1 text-xs text-slate-500 dark:text-slate-400">
            {line}
          </p>
        ))}

        <div className="print-qr-frame mt-4 flex items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 dark:border-white/15 dark:bg-black/20">
          {src ? (
            <img
              src={src}
              alt={`QR do ativo ${ativo}`}
              className={`print-qr-image rounded-lg border border-slate-200 bg-white p-2 dark:border-white/10 ${
                compact ? "h-64 w-64" : "h-40 w-40"
              }`}
            />
          ) : error ? (
            <p className="px-4 text-sm text-red-600 dark:text-red-300">{error}</p>
          ) : (
            <div className="flex h-40 w-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-hidden />
            </div>
          )}
        </div>

        <p className="print-qr-code mt-3 break-all text-xs text-slate-500 dark:text-slate-400">
          Código vinculado: {qrValue || "—"}
        </p>
        <p className="print-qr-note mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
          Escaneie este QR para abrir a página de movimentações do ativo diretamente no celular.
        </p>
      </div>
    </div>
  );
}
