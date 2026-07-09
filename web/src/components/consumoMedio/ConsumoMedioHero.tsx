import {
  Activity,
  AlertTriangle,
  CalendarRange,
  Download,
  Gauge,
  RefreshCw,
  Settings2,
} from "lucide-react";
import { glassField, glassSelect } from "../../lib/glass";
import { fmtPeriodoBr, labelCls } from "./consumoMedioUi";

export type ConsumoMedioObraOpcao = {
  codigo: number;
  nome: string;
};

export type ConsumoMedioMelosaOpcao = {
  ativo: string;
  nome: string | null;
};

type Props = {
  de: string;
  ate: string;
  filtroAtivo: string;
  filtroObra: string;
  filtroMelosa: string;
  obras: ConsumoMedioObraOpcao[];
  melosas: ConsumoMedioMelosaOpcao[];
  compararPeriodo: boolean;
  loading: boolean;
  exporting: boolean;
  canExport: boolean;
  onDeChange: (v: string) => void;
  onAteChange: (v: string) => void;
  onFiltroAtivoChange: (v: string) => void;
  onFiltroObraChange: (v: string) => void;
  onFiltroMelosaChange: (v: string) => void;
  onCompararChange: (v: boolean) => void;
  onRefresh: () => void;
  onMetas: () => void;
  onExport: () => void;
};

export default function ConsumoMedioHero({
  de,
  ate,
  filtroAtivo,
  filtroObra,
  filtroMelosa,
  obras,
  melosas,
  compararPeriodo,
  loading,
  exporting,
  canExport,
  onDeChange,
  onAteChange,
  onFiltroAtivoChange,
  onFiltroObraChange,
  onFiltroMelosaChange,
  onCompararChange,
  onRefresh,
  onMetas,
  onExport,
}: Props) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-orange-200/60 bg-gradient-to-br from-orange-50/90 via-white/80 to-amber-50/70 shadow-sm backdrop-blur-xl dark:border-orange-900/40 dark:from-orange-950/40 dark:via-slate-950/60 dark:to-amber-950/20">
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-orange-400/15 blur-3xl dark:bg-orange-600/10"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-12 left-1/3 h-40 w-40 rounded-full bg-amber-400/10 blur-3xl"
        aria-hidden
      />

      <div className="relative border-b border-orange-200/50 px-4 py-5 sm:px-6 dark:border-orange-900/30">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-lg shadow-orange-500/25">
              <Gauge className="h-6 w-6" aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
                Consumo médio
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Análise de eficiência por equipamento — média entre leituras de horímetro, metas e tendências mensais.
              </p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-orange-200/80 bg-white/70 px-3 py-1 text-xs font-semibold text-orange-800 dark:border-orange-800/50 dark:bg-black/30 dark:text-orange-300">
                <CalendarRange className="h-3.5 w-3.5" aria-hidden />
                {fmtPeriodoBr(de, ate)}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onMetas}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300/80 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-white dark:border-white/15 dark:bg-black/30 dark:text-slate-100"
            >
              <Settings2 className="h-4 w-4" />
              Metas
            </button>
            <button
              type="button"
              onClick={onExport}
              disabled={exporting || !canExport}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {exporting ? "Exportando…" : "Excel"}
            </button>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          </div>
        </div>
      </div>

      <div className="relative flex flex-wrap items-end gap-3 px-4 py-4 sm:px-6">
        <label className="filter-field">
          <span className={labelCls}>De</span>
          <input type="date" className={glassField} value={de} onChange={(e) => onDeChange(e.target.value)} />
        </label>
        <label className="filter-field">
          <span className={labelCls}>Até</span>
          <input type="date" className={glassField} value={ate} onChange={(e) => onAteChange(e.target.value)} />
        </label>
        <label className="filter-field-md">
          <span className={labelCls}>Equipamento</span>
          <input
            className={glassField}
            placeholder="Ex.: REVTR01"
            value={filtroAtivo}
            onChange={(e) => onFiltroAtivoChange(e.target.value)}
          />
        </label>
        <label className="filter-field-md">
          <span className={labelCls}>Obra</span>
          <select className={glassSelect} value={filtroObra} onChange={(e) => onFiltroObraChange(e.target.value)}>
            <option value="">Todas as obras</option>
            {obras.map((o) => (
              <option key={o.codigo} value={String(o.codigo)}>
                {o.codigo} — {o.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field-md">
          <span className={labelCls}>Melosa</span>
          <select className={glassSelect} value={filtroMelosa} onChange={(e) => onFiltroMelosaChange(e.target.value)}>
            <option value="">Todas as melosas</option>
            {melosas.map((m) => (
              <option key={m.ativo} value={m.ativo}>
                {m.ativo}
                {m.nome ? ` — ${m.nome}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
            checked={compararPeriodo}
            onChange={(e) => onCompararChange(e.target.checked)}
          />
          Comparar período anterior
        </label>
        <div className="ml-auto hidden items-center gap-2 text-xs text-slate-500 sm:flex">
          <Activity className="h-3.5 w-3.5" aria-hidden />
          Clique em um equipamento para ver detalhes completos
        </div>
      </div>
    </section>
  );
}

export function ConsumoMedioTabBar({
  tab,
  onTabChange,
  alertasCount,
  equipamentosCount,
}: {
  tab: "visao" | "equipamentos" | "qualidade";
  onTabChange: (t: "visao" | "equipamentos" | "qualidade") => void;
  alertasCount: number;
  equipamentosCount: number;
}) {
  const tabs = [
    { id: "visao" as const, label: "Visão geral", count: alertasCount > 0 ? alertasCount : null },
    { id: "equipamentos" as const, label: "Equipamentos", count: equipamentosCount },
    { id: "qualidade" as const, label: "Qualidade dos dados", count: null },
  ];

  return (
    <nav
      className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/50 p-1 dark:border-white/10 dark:bg-black/25"
      aria-label="Seções do consumo médio"
    >
      {tabs.map((t) => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onTabChange(t.id)}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              active
                ? "bg-white text-orange-700 shadow-sm dark:bg-slate-800 dark:text-orange-400"
                : "text-slate-600 hover:bg-white/60 dark:text-slate-400 dark:hover:bg-white/5"
            }`}
          >
            {t.label}
            {t.count != null ? (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                  active
                    ? "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300"
                    : "bg-slate-200/80 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                }`}
              >
                {t.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

export function ConsumoMedioSectionTitle({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof AlertTriangle;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <div>
        <h2 className="text-base font-bold text-slate-900 dark:text-white">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{description}</p> : null}
      </div>
    </div>
  );
}
