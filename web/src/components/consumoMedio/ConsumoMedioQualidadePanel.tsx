import { Link } from "react-router-dom";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { fmtLitrosDashboard } from "../../lib/combustivelControle";
import type { EquipamentoConsumoResposta } from "../../lib/consumoMedioAnalise";
import { buildMelosaBiLink, calcSaudeDados } from "../../lib/consumoMedioAnalise";
import { fmtDataBr, labelCls, tdCls, thCls } from "./consumoMedioUi";

type Props = {
  data: EquipamentoConsumoResposta;
  de: string;
  ate: string;
};

export default function ConsumoMedioQualidadePanel({ data, de, ate }: Props) {
  const saude = calcSaudeDados(data);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_1fr]">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/50 bg-white/50 p-6 dark:border-white/10 dark:bg-black/20">
          <div className="relative flex h-36 w-36 items-center justify-center">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120" aria-hidden>
              <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="10" className="text-slate-200 dark:text-slate-700" />
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="currentColor"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${(saude.pctHorimetro / 100) * 327} 327`}
                className={
                  saude.pctHorimetro >= 80
                    ? "text-emerald-500"
                    : saude.pctHorimetro >= 50
                      ? "text-amber-500"
                      : "text-red-500"
                }
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
                {Math.round(saude.pctHorimetro)}%
              </p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">horímetro válido</p>
            </div>
          </div>
          <p className="mt-4 text-center text-sm text-slate-600 dark:text-slate-400">
            Indicador de confiabilidade dos dados usados no cálculo de média.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/50 bg-white/50 p-4 dark:border-white/10 dark:bg-black/20">
            <p className={labelCls}>Equipamentos confiáveis</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {saude.confiaveis}
              <span className="text-base font-medium text-slate-400"> / {saude.total}</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">≥ 3 trechos no período</p>
          </div>
          <div className="rounded-2xl border border-white/50 bg-white/50 p-4 dark:border-white/10 dark:bg-black/20">
            <p className={labelCls}>Sem horímetro</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
              {data.sem_dados_horimetro}
            </p>
            <p className="mt-1 text-xs text-slate-500">abastecimentos sem leitura válida</p>
          </div>
          <div className="rounded-2xl border border-white/50 bg-white/50 p-4 dark:border-white/10 dark:bg-black/20">
            <p className={labelCls}>Horímetro irregular</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-red-700 dark:text-red-400">
              {data.horimetro_regressivo_total}
            </p>
            <p className="mt-1 text-xs text-slate-500">leituras regressivas detectadas</p>
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-white/50 bg-white/40 p-4 dark:border-white/10 dark:bg-black/20">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-sky-600 dark:text-sky-400" aria-hidden />
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Registros sem horímetro</h3>
            <p className="text-xs text-slate-500">Abastecimentos com litros mas sem horímetro válido para cálculo.</p>
          </div>
        </div>
        <div className="table-scroll rounded-xl border border-slate-200/70 dark:border-white/10" style={{ maxHeight: "min(32rem, 55vh)" }}>
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr>
                <th className={thCls}>Data/hora</th>
                <th className={thCls}>Equipamento</th>
                <th className={thCls}>Horímetro</th>
                <th className={thCls}>Litros</th>
                <th className={thCls}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {(data.sem_horimetro_rows ?? []).map((r, i) => (
                <tr key={`${r.ativo}-${r.data_hora}-${i}`} className={i % 2 ? "bg-slate-50/50 dark:bg-white/[0.03]" : ""}>
                  <td className={tdCls}>{fmtDataBr(r.data_hora)}</td>
                  <td className={tdCls}>
                    <p className="font-semibold">{r.ativo}</p>
                    <p className="text-xs text-slate-500">{r.nome ?? "—"}</p>
                  </td>
                  <td className={tdCls}>{r.horimetro_informado || "—"}</td>
                  <td className={`${tdCls} tabular-nums`}>{fmtLitrosDashboard(r.litros)} L</td>
                  <td className={tdCls}>
                    <Link
                      to={buildMelosaBiLink(r.ativo, de, ate)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400"
                    >
                      <ExternalLink className="h-3 w-3" />
                      BI abastecimentos
                    </Link>
                  </td>
                </tr>
              ))}
              {(data.sem_horimetro_rows ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    Todos os abastecimentos do período têm horímetro válido.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
