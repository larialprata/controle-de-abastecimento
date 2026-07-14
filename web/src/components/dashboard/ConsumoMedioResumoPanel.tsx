import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CalendarRange, Droplets, Gauge, Loader2, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { apiGet } from "../../lib/api";
import { fmtLitrosDashboard } from "../../lib/combustivelControle";
import {
  defaultPeriodoMesAtual,
  toDateInputValue,
} from "../../lib/aggregateCombustivelDashboard";
import type { EquipamentoConsumoResposta } from "../../lib/consumoMedioAnalise";
import { glassPanel } from "../../lib/glass";
import ConsumoMedioKpiCard from "../consumoMedio/ConsumoMedioKpiCard";

type Props = {
  token: string | null;
  obraCodigo?: string;
  ativoMelosa?: string;
};

function diasEntreInclusive(de: Date, ate: Date): number {
  const start = new Date(de.getFullYear(), de.getMonth(), de.getDate());
  const end = new Date(ate.getFullYear(), ate.getMonth(), ate.getDate());
  const diff = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return Math.max(1, diff + 1);
}

function diasNoMes(ref: Date): number {
  return new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
}

export default function ConsumoMedioResumoPanel({
  token,
  obraCodigo = "",
  ativoMelosa = "",
}: Props) {
  const [data, setData] = useState<EquipamentoConsumoResposta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const periodo = useMemo(() => defaultPeriodoMesAtual(), []);
  const deStr = toDateInputValue(periodo.de);
  const ateStr = toDateInputValue(periodo.ate);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("de", deStr);
      params.set("ate", ateStr);
      if (obraCodigo.trim()) params.set("obra_codigo", obraCodigo.trim());
      if (ativoMelosa.trim()) params.set("melosa", ativoMelosa.trim());
      const json = await apiGet<EquipamentoConsumoResposta>(
        `/v1/equipamentos/consumo?${params.toString()}`,
        token,
      );
      setData(json);
    } catch (err: unknown) {
      setData(null);
      setError(err instanceof Error ? err.message : "Erro ao carregar consumo médio.");
    } finally {
      setLoading(false);
    }
  }, [token, deStr, ateStr, obraCodigo, ativoMelosa]);

  useEffect(() => {
    void load();
  }, [load]);

  const resumo = useMemo(() => {
    const totalLitros = Number(data?.total_litros_equipamentos ?? 0);
    const abastecimentos = Number(data?.abastecimentos_equipamentos ?? 0);
    const diasPeriodo = diasEntreInclusive(periodo.de, periodo.ate);
    const diasMes = diasNoMes(periodo.ate);
    const mediaDia = totalLitros / diasPeriodo;
    const mediaMes = mediaDia * diasMes;
    return {
      totalLitros,
      abastecimentos,
      diasPeriodo,
      diasMes,
      mediaDia,
      mediaMes,
    };
  }, [data, periodo]);

  const obraHint = obraCodigo.trim()
    ? `Obra ${obraCodigo.trim()} · mês atual`
    : "Todas as obras · mês atual";

  return (
    <section className={`${glassPanel} p-4 md:p-5`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-white/30 pb-4 dark:border-white/10">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-orange-600/10 p-2 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400">
            <Gauge className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Consumo Médio Resumo</h2>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
              Litros abastecidos só em equipamentos (sem tanque). {obraHint}.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/consumo-medio"
            className="rounded-lg border border-slate-300 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 dark:border-white/20 dark:bg-black/20 dark:text-slate-100"
          >
            Análise completa
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || !token}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-60 dark:border-white/20 dark:bg-black/20 dark:text-slate-100"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </button>
        </div>
      </div>

      {error ? (
        <p className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {loading && !data ? (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          A carregar consumo…
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <ConsumoMedioKpiCard
            label="Consumo médio / dia"
            value={`${fmtLitrosDashboard(resumo.mediaDia)} L`}
            hint={`Média em ${resumo.diasPeriodo} dia(s) do mês`}
            icon={CalendarDays}
            tone="orange"
          />
          <ConsumoMedioKpiCard
            label="Combustível no mês / atual"
            value={`${fmtLitrosDashboard(resumo.totalLitros)} L`}
            hint={`${resumo.abastecimentos} abastecimento(s) em equipamentos`}
            icon={Droplets}
            tone="sky"
          />
          <ConsumoMedioKpiCard
            label="Consumo médio / mês previsto"
            value={`${fmtLitrosDashboard(resumo.mediaMes)} L`}
            hint={`Projeção (${fmtLitrosDashboard(resumo.mediaDia)} L/dia × ${resumo.diasMes} dias)`}
            icon={CalendarRange}
            tone="amber"
          />
        </div>
      )}
    </section>
  );
}
