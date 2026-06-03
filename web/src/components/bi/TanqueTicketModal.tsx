import { useMemo, useRef } from "react";
import { Printer, X } from "lucide-react";

export type TanqueTicketRow = {
  data: string;
  responsavelAbastecimento: string;
  placaAtivo: string;
  insumo: string;
  horimetro: string;
  litros: string;
  equipamento: string;
  movimento: string;
};

type Props = {
  rows: TanqueTicketRow[];
  onClose: () => void;
};

const MONTHS_PT = [
  "JANEIRO",
  "FEVEREIRO",
  "MARÇO",
  "ABRIL",
  "MAIO",
  "JUNHO",
  "JULHO",
  "AGOSTO",
  "SETEMBRO",
  "OUTUBRO",
  "NOVEMBRO",
  "DEZEMBRO",
];

function parseTicketDate(dataStr: string): Date | null {
  const parts = dataStr.trim().split("/");
  if (parts.length !== 3) return null;
  const day = Number(parts[0]);
  const month = Number(parts[1]) - 1;
  let year = Number(parts[2]);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  if (year < 100) year += 2000;
  const d = new Date(year, month, day);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function TanqueTicketModal({ rows, onClose }: Props) {
  const printRef = useRef<HTMLDivElement>(null);

  const mesReferencia = useMemo(() => {
    const first = rows[0]?.data;
    if (!first) return "—";
    const d = parseTicketDate(first);
    if (!d) return "—";
    return MONTHS_PT[d.getMonth()] ?? "—";
  }, [rows]);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-black/55 p-4 print:relative print:inset-auto print:block print:bg-white print:p-0"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tanque-ticket-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-5xl print:max-w-none">
        <div className="mb-3 flex flex-wrap justify-end gap-2 print:hidden">
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
          ref={printRef}
          id="tanque-ticket-print"
          className="mx-auto bg-white text-black shadow-2xl print:shadow-none"
          style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
        >
          <div className="border-2 border-black p-3 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-black pb-3">
              <div className="min-w-[140px]">
                <div className="text-lg font-black tracking-tight text-emerald-800">DELURB</div>
                <div className="text-xs font-bold uppercase text-emerald-700">Ambiental</div>
              </div>
              <div className="flex-1 text-center">
                <h1 id="tanque-ticket-title" className="text-base font-bold uppercase tracking-wide sm:text-lg">
                  Coleta de Extraordinário
                </h1>
                <p className="mt-1 text-xs font-semibold uppercase text-slate-700">Tanque — entrada e saída</p>
                <p className="mt-1 text-[11px] font-semibold text-slate-600">
                  {rows.length} {rows.length === 1 ? "registro selecionado" : "registros selecionados"}
                </p>
              </div>
              <div className="min-w-[200px] text-right text-[11px] leading-snug">
                <div>
                  <span className="font-bold">FORNECEDOR:</span> DIMENSIONAL ENGENHARIA
                </div>
                <div>
                  <span className="font-bold">PRODUTOS:</span> DERIVADOS DE PETRÓLEO
                </div>
                <div>
                  <span className="font-bold">MÊS:</span> {mesReferencia}
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-end justify-between gap-4 text-xs">
              <div className="flex-1 border-b border-black pb-1">
                <span className="font-bold uppercase">Ass. responsável abastecimento:</span>
                <span className="ml-2">{rows[0]?.responsavelAbastecimento ?? "—"}</span>
              </div>
            </div>

            <table className="mt-4 w-full border-collapse text-[11px] sm:text-xs">
              <thead>
                <tr className="bg-white">
                  <th className="w-10 border border-black px-1 py-2 text-center font-bold">ITEM</th>
                  <th className="border border-black px-2 py-2 text-center font-bold">MOV.</th>
                  <th className="border border-black px-2 py-2 text-center font-bold">DATA</th>
                  <th className="border border-black px-2 py-2 text-center font-bold">
                    RESPONSÁVEL
                    <br />
                    ABASTECIMENTO
                  </th>
                  <th className="border border-black px-2 py-2 text-center font-bold">
                    VEÍCULO/
                    <br />
                    PLACA
                  </th>
                  <th className="border border-black px-2 py-2 text-center font-bold">
                    TIPO
                    <br />
                    COMBUSTÍVEL
                  </th>
                  <th className="border border-black px-2 py-2 text-center font-bold">KM/HORÍM.</th>
                  <th className="border border-black px-2 py-2 text-center font-bold">LITROS</th>
                  <th className="border border-black px-2 py-2 text-center font-bold">
                    EQUIPAMENTO/
                    <br />
                    FORNECEDOR
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={`ticket-${row.placaAtivo}-${row.data}-${row.litros}-${idx}`} className="h-12">
                    <td className="border border-black px-1 py-2 text-center align-middle font-semibold">
                      {idx + 1}
                    </td>
                    <td className="border border-black px-2 py-2 text-center align-middle">{row.movimento}</td>
                    <td className="border border-black px-2 py-2 text-center align-middle">{row.data}</td>
                    <td className="border border-black px-2 py-2 text-center align-middle">
                      {row.responsavelAbastecimento}
                    </td>
                    <td className="border border-black px-2 py-2 text-center align-middle font-medium">
                      {row.placaAtivo}
                    </td>
                    <td className="border border-black px-2 py-2 text-center align-middle">{row.insumo}</td>
                    <td className="border border-black px-2 py-2 text-center align-middle">{row.horimetro}</td>
                    <td className="border border-black px-2 py-2 text-center align-middle font-semibold">
                      {row.litros}
                    </td>
                    <td className="border border-black px-2 py-2 text-center align-middle">{row.equipamento}</td>
                  </tr>
                ))}
                {rows.length < 10
                  ? Array.from({ length: 10 - rows.length }, (_, i) => (
                      <tr key={`empty-${i}`} className="h-12">
                        <td className="border border-black px-1 py-2 text-center align-middle text-slate-400">
                          {rows.length + i + 1}
                        </td>
                        <td className="border border-black" colSpan={8} />
                      </tr>
                    ))
                  : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #tanque-ticket-print, #tanque-ticket-print * { visibility: visible; }
          #tanque-ticket-print {
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
