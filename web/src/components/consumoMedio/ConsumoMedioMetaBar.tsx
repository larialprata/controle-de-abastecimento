import { fmtMedia } from "./consumoMedioUi";

type Props = {
  media: number | null;
  meta: number | null;
  unidade: string;
  compact?: boolean;
};

export default function ConsumoMedioMetaBar({ media, meta, unidade, compact = false }: Props) {
  if (media == null) {
    return <span className="text-xs text-slate-400">Sem média</span>;
  }

  const pctMeta = meta != null && meta > 0 ? Math.min(150, (media / meta) * 100) : null;
  const acima = meta != null && media > meta;

  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className={`font-semibold tabular-nums ${acima ? "text-red-600 dark:text-red-400" : "text-slate-700 dark:text-slate-300"}`}>
          {fmtMedia(media, unidade)}
        </span>
        {meta != null ? (
          <span className="tabular-nums text-slate-500">meta {fmtMedia(meta, unidade)}</span>
        ) : null}
      </div>
      {pctMeta != null ? (
        <div className={`overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/50 ${compact ? "h-1.5" : "h-2"}`}>
          <div
            className={`h-full rounded-full transition-all ${
              acima ? "bg-gradient-to-r from-amber-500 to-red-500" : "bg-gradient-to-r from-emerald-500 to-orange-500"
            }`}
            style={{ width: `${Math.min(100, pctMeta)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
