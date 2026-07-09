import type { ConsumoNivel, AlertaSeveridade } from "../../lib/consumoMedioAnalise";

export const labelCls =
  "text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400";

export const thCls =
  "sticky top-0 z-[1] whitespace-nowrap border-b border-slate-200/80 bg-slate-50/95 px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/90 dark:text-slate-400";

export const tdCls =
  "border-b border-slate-100 px-4 py-3 align-middle text-sm text-slate-800 dark:border-white/5 dark:text-slate-200";

export function fmtDataBr(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function fmtPeriodoBr(de: string, ate: string): string {
  const fmt = (s: string) => {
    const d = new Date(s + "T12:00:00");
    return Number.isNaN(d.getTime())
      ? s
      : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  };
  if (de && ate) return `${fmt(de)} — ${fmt(ate)}`;
  if (de) return `A partir de ${fmt(de)}`;
  if (ate) return `Até ${fmt(ate)}`;
  return "Período completo";
}

export function fmtMedia(v: number | null, unidade: string): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const label = unidade === "km" ? "L/km" : "L/h";
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${label}`;
}

export function fmtUnidade(v: number, unidade: string): string {
  const suffix = unidade === "km" ? "km" : "h";
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${suffix}`;
}

export function nivelDotClass(nivel: ConsumoNivel): string {
  if (nivel === "critico") return "bg-red-500";
  if (nivel === "atencao") return "bg-amber-500";
  return "bg-emerald-500";
}

export function severidadeIconBg(sev: AlertaSeveridade): string {
  if (sev === "danger") return "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400";
  if (sev === "warning") return "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400";
  return "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-400";
}
