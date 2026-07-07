import { TrendingUp } from "lucide-react";
import { fmtLitrosDashboard } from "../../lib/combustivelControle";
import type { ConsumoEquipamento, EquipamentoAnalise } from "../../lib/consumoMedioAnalise";
import { fmtMedia, nivelDotClass } from "./consumoMedioUi";

type Props = {
  equipamentos: ConsumoEquipamento[];
  analises: Map<string, EquipamentoAnalise>;
  onSelect: (ativo: string) => void;
  limit?: number;
};

export default function ConsumoMedioRankingPanel({ equipamentos, analises, onSelect, limit = 5 }: Props) {
  const ranking = [...equipamentos]
    .filter((e) => e.media_litros_por_unidade != null)
    .sort((a, b) => (b.media_litros_por_unidade ?? 0) - (a.media_litros_por_unidade ?? 0))
    .slice(0, limit);

  const maxMedia = ranking[0]?.media_litros_por_unidade ?? 1;

  if (ranking.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300/80 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-600">
        Sem dados de média para ranquear.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {ranking.map((eq, i) => {
        const analise = analises.get(eq.ativo);
        const media = eq.media_litros_por_unidade ?? 0;
        const pct = maxMedia > 0 ? (media / maxMedia) * 100 : 0;
        return (
          <button
            key={eq.ativo}
            type="button"
            onClick={() => onSelect(eq.ativo)}
            className="flex w-full items-center gap-3 rounded-xl border border-slate-200/70 bg-white/50 px-3 py-2.5 text-left transition hover:border-orange-300/80 hover:bg-orange-50/50 dark:border-white/10 dark:bg-black/20 dark:hover:border-orange-800/50 dark:hover:bg-orange-950/20"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${nivelDotClass(analise?.nivel ?? "ok")}`} aria-hidden />
                <span className="truncate font-semibold text-slate-900 dark:text-white">{eq.ativo}</span>
                <span className="truncate text-xs text-slate-500">{eq.nome}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/50">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-400 to-red-500"
                  style={{ width: `${Math.max(8, pct)}%` }}
                />
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-bold tabular-nums text-orange-700 dark:text-orange-400">
                {fmtMedia(eq.media_litros_por_unidade, eq.unidade)}
              </p>
              <p className="text-[10px] text-slate-500">{fmtLitrosDashboard(eq.total_litros_periodo)} L</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function ConsumoMedioRankingHeader() {
  return (
    <div className="mb-3 flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400">
        <TrendingUp className="h-4 w-4" aria-hidden />
      </div>
      <div>
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Maiores consumos</h3>
        <p className="text-xs text-slate-500">Top equipamentos por média no período</p>
      </div>
    </div>
  );
}
