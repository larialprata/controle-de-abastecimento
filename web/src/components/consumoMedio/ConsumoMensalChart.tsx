import type { ConsumoMesPoint } from "../../lib/consumoMedioAnalise";

type Props = {
  serie: ConsumoMesPoint[];
  unidade: string;
  meta: number | null;
};

function fmtMedia(v: number, unidade: string): string {
  const label = unidade === "km" ? "L/km" : "L/h";
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${label}`;
}

export default function ConsumoMensalChart({ serie, unidade, meta }: Props) {
  const comDados = serie.filter((p) => p.media_litros_por_unidade != null);
  const maxValor = Math.max(
    meta ?? 0,
    ...comDados.map((p) => p.media_litros_por_unidade ?? 0),
    0.01,
  );

  if (comDados.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300/80 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
        Sem dados mensais suficientes para o gráfico.
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-gradient-to-b from-white/60 to-slate-50/40 p-5 dark:border-white/10 dark:from-black/20 dark:to-black/10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Evolução mensal
          </p>
          <p className="text-xs text-slate-500">Últimos {serie.length} meses · {unidade === "km" ? "L/km" : "L/h"}</p>
        </div>
        {meta != null ? (
          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
            <span className="inline-block h-0 w-6 border-t-2 border-dashed border-amber-500" aria-hidden />
            Meta {fmtMedia(meta, unidade)}
          </div>
        ) : null}
      </div>

      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-8 bottom-10 flex flex-col justify-between" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="border-t border-slate-200/60 dark:border-white/5" />
          ))}
        </div>

        <div className="flex items-end gap-1 sm:gap-2" style={{ minHeight: "11rem" }}>
          {serie.map((p) => {
            const media = p.media_litros_por_unidade;
            const pct = media != null ? Math.min(100, (media / maxValor) * 100) : 0;
            const acimaMeta = meta != null && media != null && media > meta;
            return (
              <div key={p.mes} className="relative z-[1] flex min-w-0 flex-1 flex-col items-center gap-1.5">
                <div className="relative flex h-36 w-full items-end justify-center px-0.5">
                  {meta != null ? (
                    <div
                      className="pointer-events-none absolute left-0 right-0 z-[2] border-t-2 border-dashed border-amber-500/80"
                      style={{ bottom: `${Math.min(100, (meta / maxValor) * 100)}%` }}
                    />
                  ) : null}
                  <div
                    className={`relative z-[1] w-full max-w-[2.25rem] rounded-t-lg shadow-sm transition-all ${
                      media == null
                        ? "bg-slate-200/70 dark:bg-slate-700/50"
                        : acimaMeta
                          ? "bg-gradient-to-t from-red-600 to-red-400"
                          : "bg-gradient-to-t from-orange-600 to-amber-400"
                    }`}
                    style={{ height: media != null ? `${Math.max(6, pct)}%` : "6%" }}
                    title={
                      media != null
                        ? `${p.label}: ${fmtMedia(media, unidade)}`
                        : `${p.label}: sem dados`
                    }
                  />
                </div>
                <span className="max-w-full truncate text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                  {p.label}
                </span>
                <span className="text-[10px] font-medium tabular-nums text-slate-500">
                  {media != null ? fmtMedia(media, unidade) : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
