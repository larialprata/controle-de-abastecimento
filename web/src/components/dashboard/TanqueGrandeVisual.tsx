import { useEffect, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp } from "lucide-react";
import { fmtLitrosDashboard } from "../../lib/combustivelControle";

type Props = {
  titulo: string;
  saldoLitros: number;
  capacidadeLitros: number;
  ocupacaoPct: number;
  cor: string;
  pontoPedidoLitros: number;
  abaixoPonto: boolean;
  subtitulo?: string;
};

function fmtPct(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(v);
}

/** Tanque industrial grande — nível animado conforme estoque. */
export default function TanqueGrandeVisual({
  titulo,
  saldoLitros,
  capacidadeLitros,
  ocupacaoPct,
  cor,
  pontoPedidoLitros,
  abaixoPonto,
  subtitulo,
}: Props) {
  const alvoPct = Math.min(100, Math.max(0, ocupacaoPct));

  const [nivelPct, setNivelPct] = useState(0);
  useEffect(() => {
    const id = window.setTimeout(() => setNivelPct(alvoPct), 100);
    return () => window.clearTimeout(id);
  }, [alvoPct]);

  return (
    <div className="flex w-full max-w-[280px] flex-col items-center sm:max-w-[300px]">
      <h3 className="mb-4 text-center text-sm font-bold uppercase tracking-wide text-slate-800 dark:text-slate-100 sm:text-base">
        {titulo}
      </h3>

      <div className="relative w-full" style={{ aspectRatio: "3 / 4.25" }}>
        {/* Tubulação */}
        <div className="absolute left-1/2 top-[2%] z-10 h-[7%] w-[14%] -translate-x-1/2 rounded-t-md border-2 border-b-0 border-slate-500 bg-slate-300 dark:border-slate-500 dark:bg-slate-600" />
        <div className="absolute right-[12%] top-[11%] z-10 h-[3.5%] w-[24%] rounded-full border border-slate-400 bg-slate-300 dark:bg-slate-600" />

        {/* Corpo do tanque */}
        <div className="absolute inset-x-[8%] bottom-[2%] top-[8%] overflow-hidden rounded-b-[42%] rounded-t-2xl border-[3px] border-slate-500 bg-slate-100 shadow-[inset_0_8px_24px_rgba(0,0,0,0.12),0_12px_40px_rgba(0,0,0,0.15)] dark:border-slate-500 dark:bg-slate-800">
          {/* Fundo vazio */}
          <div className="absolute inset-0 bg-gradient-to-b from-slate-50 to-slate-200/80 dark:from-slate-800 dark:to-slate-900" />

          {/* Líquido — enche/esvazia */}
          <div
            className="absolute inset-x-0 bottom-0 transition-[height] duration-[1.4s] ease-[cubic-bezier(0.33,1,0.68,1)]"
            style={{
              height: `${nivelPct}%`,
              background: `linear-gradient(180deg, ${cor}ee 0%, ${cor} 45%, ${cor}cc 100%)`,
            }}
          >
            {/* Onda no topo */}
            {nivelPct > 1 ? (
              <div
                className="absolute -top-2 left-0 right-0 h-4 opacity-70"
                style={{
                  background: `radial-gradient(ellipse 55% 100% at 50% 100%, ${cor} 0%, transparent 70%)`,
                }}
              />
            ) : null}
            {/* Reflexo */}
            <div className="absolute bottom-[8%] left-[10%] top-[12%] w-[18%] rounded-full bg-white/25" />
          </div>

          {/* Marcas % */}
          <div className="pointer-events-none absolute inset-y-[6%] right-[4%] z-20 flex flex-col justify-between py-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">
            <span>100%</span>
            <span>75%</span>
            <span>50%</span>
            <span>25%</span>
            <span>0%</span>
          </div>

          {/* Litros em destaque */}
          <div className="pointer-events-none absolute inset-x-0 bottom-[22%] z-30 flex flex-col items-center">
            <span className="text-3xl font-black tabular-nums text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)] sm:text-4xl">
              {fmtLitrosDashboard(saldoLitros)}
            </span>
            <span className="mt-0.5 text-xs font-bold uppercase tracking-[0.2em] text-white/90 drop-shadow">litros</span>
          </div>
        </div>

        {/* Escada */}
        <div className="absolute bottom-[6%] left-[3%] top-[18%] w-1 rounded-full bg-slate-400/70" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="absolute left-[1%] h-0.5 w-[5%] rounded bg-slate-400/70"
            style={{ top: `${20 + i * 9}%` }}
          />
        ))}
      </div>

      {/* Info */}
      <div className="mt-5 w-full rounded-2xl border border-white/50 bg-white/65 px-4 py-3 text-center shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.06]">
        <div className="flex items-center justify-center gap-2">
          <span className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{fmtPct(alvoPct)}%</span>
          <span className="text-sm text-slate-500">ocupação</span>
          {abaixoPonto ? (
            <ArrowDown className="h-5 w-5 text-red-500" />
          ) : (
            <ArrowUp className="h-5 w-5 text-emerald-500" />
          )}
        </div>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
          Capacidade {fmtLitrosDashboard(capacidadeLitros)} L · Ponto de pedido{" "}
          {fmtLitrosDashboard(pontoPedidoLitros)} L
        </p>
        {subtitulo ? <p className="mt-1 text-xs font-medium text-slate-500">{subtitulo}</p> : null}
      </div>

      {abaixoPonto ? <AlertTriangle className="mt-4 h-12 w-12 text-amber-500 drop-shadow-lg" /> : <div className="mt-4 h-12" />}
    </div>
  );
}
