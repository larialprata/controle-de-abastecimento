import type { LucideIcon } from "lucide-react";

type Tone = "neutral" | "orange" | "emerald" | "amber" | "sky";

const toneStyles: Record<Tone, { ring: string; icon: string; value: string }> = {
  neutral: {
    ring: "from-slate-500/10 to-transparent",
    icon: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    value: "text-slate-900 dark:text-white",
  },
  orange: {
    ring: "from-orange-500/15 to-transparent",
    icon: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400",
    value: "text-orange-700 dark:text-orange-400",
  },
  emerald: {
    ring: "from-emerald-500/15 to-transparent",
    icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
    value: "text-emerald-700 dark:text-emerald-400",
  },
  amber: {
    ring: "from-amber-500/15 to-transparent",
    icon: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
    value: "text-amber-700 dark:text-amber-400",
  },
  sky: {
    ring: "from-sky-500/15 to-transparent",
    icon: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-400",
    value: "text-sky-700 dark:text-sky-400",
  },
};

type Props = {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: LucideIcon;
  tone?: Tone;
};

export default function ConsumoMedioKpiCard({ label, value, hint, icon: Icon, tone = "neutral" }: Props) {
  const s = toneStyles[tone];
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/50 bg-white/55 p-4 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/45`}
    >
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${s.ring}`} aria-hidden />
      <div className="relative flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${s.icon}`}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
          <p className={`mt-1 text-2xl font-bold tabular-nums leading-none ${s.value}`}>{value}</p>
          {hint ? <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
        </div>
      </div>
    </div>
  );
}
