import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CheckCircle2,
  Fuel,
  Gauge,
  Hash,
  LayoutDashboard,
  Truck,
} from "lucide-react";
import { glassPanel } from "../../lib/glass";

type Props = {
  ciclosCount: number;
  suspeitosCount: number;
  desviosCount: number;
  melosasCount: number;
  ultimoCicloNumero: string;
  ultimaMelosa?: string;
};

type ItemVariant = "neutral" | "ok" | "warn";

function ResumoItem({
  icon: Icon,
  label,
  value,
  detail,
  variant = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  variant?: ItemVariant;
}) {
  const styles: Record<ItemVariant, { box: string; icon: string; ring: string }> = {
    neutral: {
      box: "bg-white/55 dark:bg-white/[0.05]",
      icon: "bg-slate-500/10 text-slate-600 dark:bg-slate-400/10 dark:text-slate-300",
      ring: "border-slate-200/80 dark:border-white/10",
    },
    ok: {
      box: "bg-emerald-50/80 dark:bg-emerald-950/25",
      icon: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
      ring: "border-emerald-200/80 dark:border-emerald-800/40",
    },
    warn: {
      box: "bg-amber-50/85 dark:bg-amber-950/30",
      icon: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
      ring: "border-amber-200/80 dark:border-amber-800/40",
    },
  };
  const s = styles[variant];

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border p-4 shadow-sm ${s.box} ${s.ring}`}
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${s.icon}`}>
        <Icon className="h-5 w-5" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <p className="mt-0.5 text-2xl font-bold tabular-nums leading-none text-slate-900 dark:text-white">
          {value}
        </p>
        <p className="mt-1.5 text-xs leading-snug text-slate-600 dark:text-slate-400">{detail}</p>
      </div>
    </div>
  );
}

export default function DashboardResumoSection({
  ciclosCount,
  suspeitosCount,
  desviosCount,
  melosasCount,
  ultimoCicloNumero,
  ultimaMelosa,
}: Props) {
  const alertasTotal = suspeitosCount + desviosCount;
  const tudoOk = alertasTotal === 0;

  return (
    <section className={`${glassPanel} p-4 md:p-5`}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-white/30 pb-4 dark:border-white/10">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-slate-500/10 p-2 text-slate-600 dark:bg-slate-400/10 dark:text-slate-300">
            <LayoutDashboard className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white md:text-lg">Resumo</h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Visão rápida dos ciclos e alertas no filtro atual
            </p>
          </div>
        </div>
        <div
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
            tudoOk
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
              : "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
          }`}
        >
          {tudoOk ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Sem alertas
            </>
          ) : (
            <>
              <AlertTriangle className="h-3.5 w-3.5" />
              {alertasTotal} alerta{alertasTotal === 1 ? "" : "s"}
            </>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <ResumoItem
          icon={Fuel}
          label="Enchimentos"
          value={String(ciclosCount)}
          detail={ciclosCount === 1 ? "1 ciclo listado" : `${ciclosCount} ciclos listados`}
        />
        <ResumoItem
          icon={Truck}
          label="Melosas"
          value={String(melosasCount)}
          detail={melosasCount === 1 ? "1 ativo no filtro" : `${melosasCount} ativos no filtro`}
        />
        <ResumoItem
          icon={Hash}
          label="Último ciclo"
          value={ultimoCicloNumero}
          detail={ultimaMelosa ? `Melosa ${ultimaMelosa}` : "Nenhum ciclo ainda"}
        />
        <ResumoItem
          icon={AlertTriangle}
          label="Capacidade"
          value={String(suspeitosCount)}
          detail={
            suspeitosCount === 0
              ? "Nenhum enchimento acima do limite"
              : `${suspeitosCount} acima da capacidade`
          }
          variant={suspeitosCount > 0 ? "warn" : "ok"}
        />
        <ResumoItem
          icon={Gauge}
          label="Medidor"
          value={String(desviosCount)}
          detail={
            desviosCount === 0
              ? "Continuidade do medidor ok"
              : `${desviosCount} com continuidade quebrada`
          }
          variant={desviosCount > 0 ? "warn" : "ok"}
        />
      </div>
    </section>
  );
}
