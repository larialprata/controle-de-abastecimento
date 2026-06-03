import { AlertTriangle, Printer, TrendingUp, X } from "lucide-react";
import type {
  ResumoAbastecimentoAnalise,
  ResumoAtivoMelosaPayload,
  ResumoEventoLinha,
} from "../../lib/melosaAtivoResumo";
import { fmtLitrosDashboard, fmtPctDashboard } from "../../lib/combustivelControle";

type Props = {
  resumo: ResumoAtivoMelosaPayload;
  limitePct: number;
  onClose: () => void;
};

const thCls =
  "whitespace-nowrap border-b border-slate-200 bg-slate-100/90 px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-300";

const tdCls =
  "border-b border-slate-100 px-3 py-2 align-top text-sm text-slate-800 dark:border-white/5 dark:text-slate-200";

function AbastecimentoAnaliseCard({ analise }: { analise: ResumoAbastecimentoAnalise }) {
  const borderTone =
    analise.status === "inconsistente"
      ? "border-red-300/80 bg-red-50/70 dark:border-red-900/50 dark:bg-red-950/25"
      : analise.status === "atencao"
        ? "border-amber-300/80 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/25"
        : "border-emerald-300/70 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20";

  return (
    <div className={`rounded-xl border px-4 py-4 text-sm ${borderTone}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-slate-900 dark:text-white">{analise.equipamento}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {analise.dataHoraFmt} · {analise.responsavel}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${
            analise.status === "inconsistente"
              ? "bg-red-600 text-white"
              : analise.status === "atencao"
                ? "bg-amber-600 text-white"
                : "bg-emerald-600 text-white"
          }`}
        >
          {analise.status === "inconsistente" ? "Revisar" : analise.status === "atencao" ? "Atenção" : "OK"}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">Sobra contábil antes</p>
          <p className="text-lg font-bold tabular-nums">{fmtLitrosDashboard(analise.sobraAntesLitros)} L</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">Medidor ao chegar</p>
          <p className="text-lg font-bold tabular-nums">{analise.medidorInicial}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">Saiu da melosa antes de chegar</p>
          <p
            className={`text-lg font-bold tabular-nums ${
              analise.statusSaidaAntesChegar === "suspeita"
                ? "text-red-800 dark:text-red-300"
                : "text-slate-700 dark:text-slate-200"
            }`}
          >
            {analise.litrosSaidaMelosaAntesChegar != null
              ? `${fmtLitrosDashboard(analise.litrosSaidaMelosaAntesChegar)} L`
              : "—"}
          </p>
          {analise.litrosSaidaMelosaPct != null ? (
            <p className="text-xs text-slate-500">{fmtPctDashboard(analise.litrosSaidaMelosaPct)} da sobra</p>
          ) : null}
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-slate-500">Para o equipamento (ini − fin)</p>
          <p className="text-lg font-bold tabular-nums text-amber-800 dark:text-amber-300">
            {analise.litrosParaEquipamento != null
              ? `${fmtLitrosDashboard(analise.litrosParaEquipamento)} L`
              : "—"}
          </p>
        </div>
      </div>

      {analise.consumoGasolinaAceitavelLitros != null && analise.litrosSaidaMelosaAntesChegar != null ? (
        <div
          className={`mt-3 rounded-lg border px-4 py-3 ${
            analise.statusSaidaAntesChegar === "suspeita"
              ? "border-amber-300/80 bg-amber-50/80 dark:border-amber-800/60 dark:bg-amber-950/30"
              : "border-slate-200/80 bg-slate-50/80 dark:border-white/10 dark:bg-slate-950/30"
          }`}
        >
          <p className="text-xs font-bold uppercase text-slate-600 dark:text-slate-400">
            Gasolina do caminhão (até {fmtPctDashboard(analise.limiteConsumoMelosaPct)} da sobra)
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <div>
              <p className="text-xs text-slate-500">Aceitável</p>
              <p className="font-bold tabular-nums">{fmtLitrosDashboard(analise.consumoGasolinaAceitavelLitros)} L</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Saída real</p>
              <p className="font-bold tabular-nums">{fmtLitrosDashboard(analise.litrosSaidaMelosaAntesChegar)} L</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Volume suspeito</p>
              <p
                className={`font-bold tabular-nums ${
                  (analise.volumeSuspeitoSaidaLitros ?? 0) > 0
                    ? "text-amber-900 dark:text-amber-200"
                    : "text-emerald-800 dark:text-emerald-300"
                }`}
              >
                {fmtLitrosDashboard(analise.volumeSuspeitoSaidaLitros ?? 0)} L
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {analise.litrosNaMelosaApos != null ? (
        <div className="mt-3 rounded-lg border border-sky-300/80 bg-sky-50/80 px-4 py-3 dark:border-sky-800/60 dark:bg-sky-950/30">
          <p className="text-xs font-bold uppercase text-sky-800 dark:text-sky-300">Na melosa agora (medidor final)</p>
          <p className="text-2xl font-bold tabular-nums text-sky-900 dark:text-sky-100">
            {fmtLitrosDashboard(analise.litrosNaMelosaApos)} L
          </p>
          <p className="mt-1 text-xs text-sky-800/90 dark:text-sky-200/80">
            Leitura ao terminar o abastecimento — combustível que ficou no caminhão.
          </p>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <p className="rounded-lg bg-white/60 px-3 py-2 text-xs dark:bg-black/20">
          <span className="font-semibold text-slate-700 dark:text-slate-300">Medidor ao terminar:</span>{" "}
          <strong>{analise.medidorFinal}</strong>
        </p>
        <p className="rounded-lg bg-white/60 px-3 py-2 text-xs dark:bg-black/20">
          <span className="font-semibold text-slate-700 dark:text-slate-300">Sobra contábil após:</span>{" "}
          {analise.sobraContabilApos != null ? (
            <strong>{fmtLitrosDashboard(analise.sobraContabilApos)} L</strong>
          ) : (
            "—"
          )}
          <span className="block text-slate-500 dark:text-slate-400">
            (pode diferir do medidor final — use o medidor para o que ficou na melosa)
          </span>
        </p>
      </div>

      {analise.notas.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-600 dark:text-slate-400">
          {analise.notas.map((msg, i) => (
            <li key={`nota-${analise.key}-${i}`}>{msg}</li>
          ))}
        </ul>
      ) : null}

      {analise.alertas.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-600 dark:text-slate-400">
          {analise.alertas.map((msg, i) => (
            <li key={`alert-${analise.key}-${i}`}>{msg}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function EventosTable({
  titulo,
  eventos,
  emptyMsg,
}: {
  titulo: string;
  eventos: ResumoEventoLinha[];
  emptyMsg: string;
}) {
  return (
    <div className="mb-6">
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
        {titulo}
        <span className="ml-2 font-normal normal-case text-slate-500 dark:text-slate-400">
          ({eventos.length} {eventos.length === 1 ? "registo" : "registos"})
        </span>
      </h3>
      {eventos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300/80 px-4 py-6 text-center text-sm text-slate-500 dark:border-white/15 dark:text-slate-400">
          {emptyMsg}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-white/10">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr>
                <th className={thCls}>Data/hora</th>
                <th className={thCls}>Litros</th>
                <th className={thCls}>Horímetro / hodômetro</th>
                <th className={thCls}>Equipamento</th>
                <th className={thCls}>Local</th>
                <th className={thCls}>Obra</th>
                <th className={thCls}>Responsável</th>
                <th className={thCls}>Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((e) => (
                <tr key={e.key} className="even:bg-slate-50/50 dark:even:bg-white/[0.02]">
                  <td className={`${tdCls} whitespace-nowrap font-medium`}>{e.dataHoraFmt}</td>
                  <td className={`${tdCls} whitespace-nowrap font-semibold tabular-nums`}>{e.litrosFmt}</td>
                  <td className={tdCls}>{e.horimetro}</td>
                  <td className={tdCls}>{e.equipamento}</td>
                  <td className={`${tdCls} max-w-[200px]`}>{e.local}</td>
                  <td className={tdCls}>{e.obra}</td>
                  <td className={tdCls}>{e.responsavel}</td>
                  <td className={`${tdCls} max-w-[220px] text-xs text-slate-600 dark:text-slate-400`}>
                    {e.detalhe || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function MelosaAtivoResumoModal({ resumo, limitePct, onClose }: Props) {
  const { totais } = resumo;
  const statusBadge =
    totais.status === "suspeita" ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-3 py-1 text-xs font-bold uppercase text-white">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
        Suspeita de desvio
      </span>
    ) : totais.status === "ok" ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold uppercase text-white">
        <TrendingUp className="h-3.5 w-3.5" aria-hidden />
        Dentro do aceitável
      </span>
    ) : (
      <span className="rounded-full bg-slate-500 px-3 py-1 text-xs font-bold uppercase text-white">
        Sem retirada no período
      </span>
    );

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/60 p-4 print:relative print:inset-auto print:block print:bg-white print:p-0"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resumo-ativo-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="my-2 w-full max-w-6xl print:max-w-none">
        <div className="mb-3 flex flex-wrap justify-end gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900"
          >
            <Printer className="h-4 w-4" aria-hidden />
            Imprimir
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-white/20 dark:bg-slate-900 dark:text-white"
          >
            <X className="h-4 w-4" aria-hidden />
            Fechar
          </button>
        </div>

        <div className="rounded-2xl border border-white/50 bg-white/95 p-5 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95 print:border-0 print:shadow-none">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4 dark:border-white/10">
            <div>
              <h2 id="resumo-ativo-title" className="text-xl font-bold text-slate-900 dark:text-white">
                Resumo — {resumo.ativoPlaca}
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Período: <strong>{resumo.periodoLabel}</strong>
              </p>
              {resumo.responsaveis.length > 0 ? (
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Utilizadores no período:{" "}
                  <strong>{resumo.responsaveis.join(", ")}</strong>
                </p>
              ) : null}
            </div>
            {statusBadge}
          </div>

          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/30">
              <p className="text-xs font-bold uppercase text-emerald-800 dark:text-emerald-400">Retirado do tanque</p>
              <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {fmtLitrosDashboard(totais.retiradaTanque)} L
              </p>
            </div>
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/30">
              <p className="text-xs font-bold uppercase text-amber-800 dark:text-amber-400">Abastecimentos</p>
              <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {fmtLitrosDashboard(totais.abastecimentos)} L
              </p>
            </div>
            <div className="rounded-xl border border-sky-200/80 bg-sky-50/80 px-4 py-3 dark:border-sky-900/40 dark:bg-sky-950/30">
              <p className="text-xs font-bold uppercase text-sky-800 dark:text-sky-400">Devolvido ao tanque</p>
              <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {fmtLitrosDashboard(totais.devolvido)} L
              </p>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
              <p className="text-xs font-bold uppercase text-slate-600 dark:text-slate-400">Sobra na melosa</p>
              <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {fmtLitrosDashboard(totais.sobra)} L
              </p>
            </div>
          </div>

          <div className="mb-6 rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">
              Fechamento (desvio)
            </p>
            <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <p>
                <span className="text-slate-500 dark:text-slate-400">Justificado:</span>{" "}
                <strong>{fmtLitrosDashboard(totais.volumeJustificado)} L</strong>
              </p>
              <p>
                <span className="text-slate-500 dark:text-slate-400">Diferença:</span>{" "}
                <strong>
                  {fmtLitrosDashboard(totais.diferenca)} L ({fmtPctDashboard(totais.diferencaPct)})
                </strong>
              </p>
              <p>
                <span className="text-slate-500 dark:text-slate-400">Volume suspeito:</span>{" "}
                <strong>{fmtLitrosDashboard(totais.volumeSuspeito)} L</strong>
              </p>
              <p>
                <span className="text-slate-500 dark:text-slate-400">Limite:</span>{" "}
                <strong>{limitePct}%</strong>
              </p>
            </div>
          </div>

          {resumo.analiseAbastecimentos.length > 0 ? (
            <div className="mb-6">
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                Abastecimentos × sobra na melosa
              </h3>
              <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">
                Para cada abastecimento: <strong>sobra contábil</strong> antes do registo;{" "}
                <strong>saiu da melosa antes de chegar</strong> = sobra − medidor ao chegar (ex.: 153 L). Compara com o
                consumo aceitável do caminhão ({limitePct}% da sobra, ex.: 3,5% × 340 ≈ 11,9 L); o{" "}
                <strong>volume suspeito</strong> é o que passa dessa margem. <strong>Para o equipamento</strong> = ini −
                fin (130 L); <strong>na melosa agora</strong> = medidor final (57 L).
              </p>
              <div className="space-y-3">
                {resumo.analiseAbastecimentos.map((a) => (
                  <AbastecimentoAnaliseCard key={a.key} analise={a} />
                ))}
              </div>
            </div>
          ) : null}

          {resumo.analiseTrechos.length > 0 ? (
            <div className="mb-6">
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                Análise horímetro equipamento (trechos)
              </h3>
              <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">
                Compara variação de horímetro ou hodômetro entre abastecimentos e litros registados — ajuda a
                estimar consumo e identificar desvios.
              </p>
              <ul className="space-y-2">
                {resumo.analiseTrechos.map((t, i) => (
                  <li
                    key={`trecho-${i}`}
                    className="rounded-lg border border-slate-200/80 bg-white/60 px-4 py-3 text-sm dark:border-white/10 dark:bg-white/[0.04]"
                  >
                    <p className="font-semibold text-slate-900 dark:text-white">{t.label}</p>
                    <p className="mt-1 text-slate-700 dark:text-slate-300">
                      {t.horimetroInicio} → {t.horimetroFim}
                      {t.deltaHorimetro != null ? (
                        <>
                          {" "}
                          (Δ <strong>{fmtLitrosDashboard(t.deltaHorimetro)}</strong> {t.unidade})
                        </>
                      ) : null}
                      {" · "}
                      <strong>{fmtLitrosDashboard(t.litros)} L</strong>
                      {t.litrosPorUnidade != null ? (
                        <>
                          {" "}
                          → <strong>{fmtLitrosDashboard(t.litrosPorUnidade)} L/{t.unidade}</strong>
                        </>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t.observacao}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <EventosTable
            titulo="Retiradas do tanque"
            eventos={resumo.retiradas}
            emptyMsg="Nenhuma retirada do tanque para este ativo no período."
          />
          <EventosTable
            titulo="Abastecimentos em equipamentos"
            eventos={resumo.abastecimentos}
            emptyMsg="Nenhum abastecimento melosa para este ativo no período."
          />
          <EventosTable
            titulo="Devoluções ao tanque"
            eventos={resumo.devolucoes}
            emptyMsg="Nenhuma entrada no tanque (devolução) com esta placa no período."
          />

          <details className="text-sm text-slate-600 dark:text-slate-400">
            <summary className="cursor-pointer font-semibold text-slate-800 dark:text-slate-200">
              Linha do tempo (todos os eventos)
            </summary>
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200/80 dark:border-white/10">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr>
                    <th className={thCls}>Data/hora</th>
                    <th className={thCls}>Tipo</th>
                    <th className={thCls}>Litros</th>
                    <th className={thCls}>Horímetro</th>
                    <th className={thCls}>Responsável</th>
                  </tr>
                </thead>
                <tbody>
                  {resumo.cronologico.map((e) => (
                    <tr key={`crono-${e.key}`}>
                      <td className={tdCls}>{e.dataHoraFmt}</td>
                      <td className={tdCls}>{e.tipoLabel}</td>
                      <td className={`${tdCls} font-semibold tabular-nums`}>{e.litrosFmt}</td>
                      <td className={tdCls}>{e.horimetro}</td>
                      <td className={tdCls}>{e.responsavel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
