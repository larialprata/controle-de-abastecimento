import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { alertaBorderClasses, type ConsumoAlerta } from "../../lib/consumoMedioAnalise";
import { severidadeIconBg } from "./consumoMedioUi";

type Props = {
  alertas: ConsumoAlerta[];
  onSelectAtivo?: (ativo: string) => void;
};

function SeveridadeIcon({ severidade }: { severidade: ConsumoAlerta["severidade"] }) {
  const cls = `flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${severidadeIconBg(severidade)}`;
  if (severidade === "danger" || severidade === "warning") {
    return (
      <div className={cls}>
        <AlertTriangle className="h-4 w-4" aria-hidden />
      </div>
    );
  }
  return (
    <div className={cls}>
      <Info className="h-4 w-4" aria-hidden />
    </div>
  );
}

export default function ConsumoMedioAlertasPanel({ alertas, onSelectAtivo }: Props) {
  const relevantes = alertas.filter((a) => a.severidade !== "info");

  if (relevantes.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/60 px-5 py-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
          <CheckCircle2 className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">Frota dentro do esperado</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">Nenhum alerta crítico ou de atenção no período filtrado.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {relevantes.slice(0, 8).map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => (a.ativo && onSelectAtivo ? onSelectAtivo(a.ativo) : undefined)}
          disabled={!a.ativo || !onSelectAtivo}
          className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition ${
            alertaBorderClasses(a.severidade)
          } ${a.ativo && onSelectAtivo ? "cursor-pointer hover:brightness-[0.98] dark:hover:brightness-110" : "cursor-default"}`}
        >
          <SeveridadeIcon severidade={a.severidade} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{a.titulo}</p>
              {a.ativo ? (
                <span className="rounded-md bg-black/5 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-slate-600 dark:bg-white/10 dark:text-slate-300">
                  {a.ativo}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{a.descricao}</p>
          </div>
        </button>
      ))}
      {relevantes.length > 8 ? (
        <p className="px-1 text-xs text-slate-500">+ {relevantes.length - 8} alertas — exporte o Excel para ver todos.</p>
      ) : null}
    </div>
  );
}
