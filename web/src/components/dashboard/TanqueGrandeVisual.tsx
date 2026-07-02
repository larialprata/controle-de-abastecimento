import { useEffect, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp } from "lucide-react";
import { fmtLitrosDashboard } from "../../lib/combustivelControle";

type Props = {
  titulo: string;
  saldoLitros: number;
  capacidadeLitros: number;
  ocupacaoPct: number;
  cor: string;
  abaixoPonto: boolean;
  subtitulo?: string;
  tipo?: "tanque" | "melosa";
};

const ESCALA_PCTS = [100, 75, 50, 25, 0] as const;
const TANK_BODY_H = 118;

function fmtPct(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(v);
}

/** Cartão de tanque com tamanho fixo — todos iguais na grade. */
export default function TanqueGrandeVisual({
  titulo,
  saldoLitros,
  capacidadeLitros,
  ocupacaoPct,
  cor,
  abaixoPonto,
  subtitulo,
  tipo = "melosa",
}: Props) {
  const alvoPct = Math.min(100, Math.max(0, ocupacaoPct));

  const [nivelPct, setNivelPct] = useState(0);
  useEffect(() => {
    const id = window.setTimeout(() => setNivelPct(alvoPct), 80);
    return () => window.clearTimeout(id);
  }, [alvoPct]);

  const bordaTipo =
    tipo === "tanque"
      ? "border-amber-400/40 dark:border-amber-500/30"
      : "border-sky-400/40 dark:border-sky-500/30";

  return (
    <article
      className={`flex w-[168px] flex-col rounded-2xl border bg-white/60 shadow-sm backdrop-blur-sm dark:bg-slate-900/50 ${bordaTipo}`}
    >
      <header className="flex h-10 shrink-0 items-center justify-center border-b border-white/40 px-2 dark:border-white/10">
        <h3 className="truncate text-center text-xs font-bold uppercase tracking-wide text-slate-800 dark:text-slate-100">
          {titulo}
        </h3>
      </header>

      {/* Tanque quadrado + medidores alinhados à altura do corpo */}
      <div className="mt-2 flex items-end justify-center gap-1.5 px-2">
        {/* Traços à esquerda — mesma altura do corpo */}
        <div
          className="relative flex shrink-0 flex-col justify-between"
          style={{ width: 14, height: TANK_BODY_H }}
        >
          <div
            className="pointer-events-none absolute bottom-0 top-0 left-1/2 w-px -translate-x-1/2 bg-slate-400/90 dark:bg-slate-500/90"
            aria-hidden
          />
          {ESCALA_PCTS.map((pct) => (
            <div key={pct} className="relative z-[1] flex h-0 items-center">
              <div className="h-px w-3 bg-slate-400/90 dark:bg-slate-500/90" />
            </div>
          ))}
        </div>

        {/* Tampa + corpo retangular */}
        <div className="flex shrink-0 flex-col items-center">
          <div className="mb-0.5 h-2 w-5 shrink-0 rounded-t border border-b-0 border-slate-400 bg-slate-300 dark:border-slate-500 dark:bg-slate-600" />
          <div
            className="relative w-[72px] overflow-hidden rounded-md border-2 border-slate-400 bg-slate-100 shadow-inner dark:border-slate-500 dark:bg-slate-800"
            style={{ height: TANK_BODY_H }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-slate-100 to-slate-200/90 dark:from-slate-800 dark:to-slate-950" />
            <div
              className="absolute inset-x-0 bottom-0 transition-[height] duration-[1.2s] ease-out"
              style={{
                height: `${nivelPct}%`,
                background: `linear-gradient(180deg, ${cor} 0%, ${cor}dd 100%)`,
              }}
            />
            {nivelPct > 2 ? (
              <div
                className="absolute inset-x-0 opacity-70"
                style={{
                  bottom: `${nivelPct}%`,
                  height: 2,
                  background: `linear-gradient(90deg, transparent, ${cor}, transparent)`,
                }}
              />
            ) : null}
          </div>
        </div>

        {/* % à direita — alinhado aos traços */}
        <div
          className="flex shrink-0 flex-col justify-between text-right"
          style={{ width: 22, height: TANK_BODY_H }}
        >
          {ESCALA_PCTS.map((pct) => (
            <span
              key={pct}
              className="block text-[7px] font-semibold leading-none text-slate-500 dark:text-slate-400"
            >
              {pct}%
            </span>
          ))}
        </div>
      </div>

      {/* Dados — colados ao tanque */}
      <div className="px-2.5 pb-2.5 pt-1">
        <p className="text-center text-base font-black tabular-nums leading-none text-slate-900 dark:text-white">
          {fmtLitrosDashboard(saldoLitros)}
          <span className="ml-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">L</span>
        </p>

        <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1">
          <span className="text-sm font-bold tabular-nums text-slate-800 dark:text-slate-200">
            {fmtPct(alvoPct)}%
          </span>
          {abaixoPonto ? (
            <ArrowDown className="h-3.5 w-3.5 shrink-0 text-red-500" aria-hidden />
          ) : (
            <ArrowUp className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
          )}
          {abaixoPonto ? (
            <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
              Baixo
            </span>
          ) : null}
        </div>

        <p className="mt-1 truncate text-center text-[10px] leading-tight text-slate-500 dark:text-slate-400">
          Cap. {fmtLitrosDashboard(capacidadeLitros)} L
          {subtitulo ? ` · ${subtitulo}` : ""}
        </p>
      </div>
    </article>
  );
}
