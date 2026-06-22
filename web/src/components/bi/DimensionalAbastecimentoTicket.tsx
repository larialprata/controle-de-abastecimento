import { Printer, X } from "lucide-react";

function TicketSignatureImg({ url, alt }: { url?: string | null; alt: string }) {
  if (!url?.trim()) {
    return (
      <div
        className="ticket-signature-placeholder ml-auto h-14 min-w-[7rem] flex-1 max-w-[10rem]"
        aria-hidden
      />
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      className="ticket-signature-img ml-auto h-14 min-w-[7rem] flex-1 max-w-[10rem] object-contain object-center"
    />
  );
}

function TicketSignatureCell({
  label,
  name,
  signatureUrl,
  signatureAlt,
}: {
  label: string;
  name: string;
  signatureUrl?: string | null;
  signatureAlt: string;
}) {
  return (
    <td className="w-1/3 border border-black px-2 py-2 align-bottom">
      <span className="font-bold uppercase">{label}</span>
      <div className="mt-2 min-h-[4.5rem]">
        <div className="font-medium leading-tight">{name}</div>
        <div className="mt-1 flex min-h-[3.5rem] items-center">
          <TicketSignatureImg url={signatureUrl} alt={signatureAlt} />
        </div>
      </div>
    </td>
  );
}

export type DimensionalAbastecimentoRow = {
  numero: string;
  data: string;
  insumo: string;
  litros: string;
  equipamento: string;
  obra: string;
  horimetro: string;
  observacoes: string;
  nome: string;
  responsavelAbastecimento: string;
  assinaturaMotoristaPath?: string | null;
  assinaturaOperadorPath?: string | null;
  assinaturaMotoristaUrl?: string | null;
  assinaturaOperadorUrl?: string | null;
};

type Props = {
  rows: DimensionalAbastecimentoRow[];
  tituloSub?: string;
  printId: string;
  onClose: () => void;
  loadingSignatures?: boolean;
};

function fuelKind(insumo: string): "ALCOOL" | "DIESEL" | "GASOLINA" | null {
  const u = insumo.trim().toUpperCase();
  if (u.includes("ALCOOL") || u.includes("ÁLCOOL")) return "ALCOOL";
  if (u.includes("DIESEL")) return "DIESEL";
  if (u.includes("GASOLINA")) return "GASOLINA";
  return null;
}

function TicketSheet({
  row,
  tituloSub,
}: {
  row: DimensionalAbastecimentoRow;
  tituloSub?: string;
}) {
  const kind = fuelKind(row.insumo);
  const litrosAlcool = kind === "ALCOOL" ? row.litros : "";
  const litrosDiesel = kind === "DIESEL" ? row.litros : "";
  const litrosGasolina = kind === "GASOLINA" ? row.litros : "";
  const litrosOutro = kind == null && row.litros !== "—" ? row.litros : "";

  return (
    <div className="mb-6 break-after-page border-2 border-black bg-white p-2 last:mb-0 print:mb-0 print:break-after-page">
      <div className="flex items-start justify-between gap-2 border-b border-black pb-2">
        <div className="flex min-w-0 items-start gap-2">
          <img
            src="/dimensional-logo.png"
            alt="Dimensional Engenharia"
            className="h-14 w-auto max-w-[120px] object-contain object-left"
          />
        </div>
        <div className="flex-1 px-2 text-center">
          <h2 className="text-sm font-bold uppercase leading-tight tracking-wide sm:text-base">
            Controle de Abastecimento
          </h2>
          {tituloSub ? <p className="mt-0.5 text-[10px] font-semibold uppercase text-slate-700">{tituloSub}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <span className="text-xs font-bold">Nº</span>
          <span className="ml-1 text-sm font-bold text-red-700">{row.numero}</span>
        </div>
      </div>

      <table className="mt-2 w-full border-collapse text-[10px] sm:text-[11px]">
        <thead>
          <tr>
            <th className="w-1/2 border border-black bg-slate-50 px-1 py-1 font-bold">TIPO</th>
            <th className="w-1/2 border border-black bg-slate-50 px-1 py-1 font-bold">QUANT.</th>
          </tr>
        </thead>
        <tbody>
          <tr className="h-7">
            <td className="border border-black px-2 py-1 font-semibold">ALCOOL</td>
            <td className="border border-black px-2 py-1 text-center">{litrosAlcool}</td>
          </tr>
          <tr className="h-7">
            <td className="border border-black px-2 py-1 font-semibold">DIESEL</td>
            <td className="border border-black px-2 py-1 text-center font-semibold">
              {litrosDiesel || litrosOutro}
            </td>
          </tr>
          <tr className="h-7">
            <td className="border border-black px-2 py-1 font-semibold">GASOLINA</td>
            <td className="border border-black px-2 py-1 text-center">{litrosGasolina}</td>
          </tr>
        </tbody>
      </table>

      <table className="mt-0 w-full border-collapse text-[10px] sm:text-[11px]">
        <tbody>
          <tr>
            <td className="w-[34%] border border-black px-2 py-2 align-top">
              <span className="font-bold uppercase">Equipamento</span>
              <div className="mt-1 min-h-[2rem] whitespace-normal break-words font-medium leading-snug">
                {row.equipamento}
              </div>
            </td>
            <td className="w-[22%] border border-black px-2 py-2 align-top">
              <span className="font-bold uppercase">Obra</span>
              <div className="mt-1 min-h-[2rem] font-medium">{row.obra}</div>
            </td>
            <td className="border border-black px-2 py-2 align-top">
              <div className="flex flex-wrap gap-3 font-bold uppercase">
                <span>
                  <span className="mr-1 inline-block h-3 w-3 border border-black align-middle" aria-hidden />
                  Horímetro
                </span>
                <span>
                  <span className="mr-1 inline-block h-3 w-3 border border-black align-middle" aria-hidden />
                  Hodômetro
                </span>
              </div>
              <div className="mt-2">
                <span className="font-bold uppercase">Hora / Km</span>
                <div className="mt-0.5 font-medium">{row.horimetro}</div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="mt-0 border border-black px-2 py-2 text-[10px] sm:text-[11px]">
        <span className="font-bold uppercase">Obs</span>
        <div className="mt-1 min-h-[1.75rem]">{row.observacoes || " "}</div>
      </div>

      <table className="mt-0 w-full border-collapse text-[10px] sm:text-[11px]">
        <tbody>
          <tr>
            <td className="w-1/3 border border-black px-2 py-3 align-bottom">
              <span className="font-bold uppercase">Data</span>
              <div className="mt-4 font-medium">{row.data}</div>
            </td>
            <TicketSignatureCell
              label="Nome"
              name={row.nome}
              signatureUrl={row.assinaturaMotoristaUrl}
              signatureAlt="Assinatura do motorista"
            />
            <TicketSignatureCell
              label="Resp. abastecimento"
              name={row.responsavelAbastecimento}
              signatureUrl={row.assinaturaOperadorUrl}
              signatureAlt="Assinatura do responsável pelo abastecimento"
            />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function DimensionalAbastecimentoTicket({
  rows,
  tituloSub,
  printId,
  onClose,
  loadingSignatures,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-black/55 p-4 print:relative print:inset-auto print:block print:bg-white print:p-0"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl print:max-w-none">
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2 print:hidden">
          {loadingSignatures ? (
            <span className="mr-auto text-xs font-medium text-slate-500">Carregando assinaturas…</span>
          ) : null}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900"
          >
            <Printer className="h-4 w-4" aria-hidden />
            Imprimir
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <X className="h-4 w-4" aria-hidden />
            Fechar
          </button>
        </div>

        <div
          id={printId}
          className="mx-auto text-black print:shadow-none"
          style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
        >
          {rows.map((row, idx) => (
            <TicketSheet key={`${row.numero}-${idx}`} row={row} tituloSub={tituloSub} />
          ))}
        </div>
      </div>

      <style>{`
        .ticket-signature-img,
        .ticket-signature-placeholder {
          border: 1px solid #64748b;
          background: #ffffff !important;
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }
        .ticket-signature-placeholder {
          opacity: 0.35;
        }
        @media print {
          body * { visibility: hidden; }
          #${printId}, #${printId} * { visibility: visible; }
          #${printId} {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
