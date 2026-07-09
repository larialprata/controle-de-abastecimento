import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Droplets,
  Fuel,
  TrendingDown,
} from "lucide-react";
import { apiGet } from "../../lib/api";
import { fmtLitrosDashboard } from "../../lib/combustivelControle";
import { glassPanel } from "../../lib/glass";

export type FluxoEventoTipo =
  | "entrada_tanque"
  | "enchimento_melosa"
  | "abastecimento_equip"
  | "registro_inesperado";

export type FluxoEvento = {
  id: string;
  tipo: FluxoEventoTipo;
  data_hora: string;
  litros: number;
  titulo: string;
  subtitulo: string;
  equipamento: string | null;
  ciclo_numero: number | null;
  saldo_tanque: number;
  saldo_melosa: number;
  capacidade_melosa: number | null;
  alertas: string[];
};

export type MelosaFluxoResposta = {
  ativo_melosa: string;
  capacidade_litros: number | null;
  obra_codigo: number | null;
  eventos: FluxoEvento[];
  resumo: {
    saldo_tanque_atual: number;
    saldo_melosa_atual: number;
    total_entrada_tanque: number;
    total_retirada_melosa: number;
    total_abastecimentos: number;
    registros_inesperados: number;
    alertas_count: number;
  };
  por_dia: Array<{
    data: string;
    abastecimentos_count: number;
    litros_abastecidos: number;
    saldo_melosa_fim_dia: number;
    saldo_tanque_fim_dia: number;
  }>;
};

type Props = {
  token: string | null;
  ativo: string;
  obraCodigo?: string;
};

const labelCls =
  "text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400";

function fmtDataBr(v: string): string {
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

function iconeEvento(tipo: FluxoEventoTipo) {
  switch (tipo) {
    case "entrada_tanque":
      return TrendingDown;
    case "enchimento_melosa":
      return Fuel;
    case "abastecimento_equip":
      return Droplets;
    case "registro_inesperado":
      return AlertTriangle;
    default:
      return Droplets;
  }
}

function corEvento(tipo: FluxoEventoTipo, temAlerta: boolean): string {
  if (temAlerta) return "border-red-400/70 bg-red-50/80 dark:border-red-900/50 dark:bg-red-950/30";
  switch (tipo) {
    case "entrada_tanque":
      return "border-sky-300/70 bg-sky-50/70 dark:border-sky-900/40 dark:bg-sky-950/25";
    case "enchimento_melosa":
      return "border-amber-300/70 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/25";
    case "abastecimento_equip":
      return "border-emerald-300/70 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/25";
    case "registro_inesperado":
      return "border-violet-300/70 bg-violet-50/70 dark:border-violet-900/40 dark:bg-violet-950/25";
    default:
      return "border-white/40 bg-white/40 dark:border-white/10 dark:bg-white/[0.04]";
  }
}

function StatMini({
  title,
  value,
  hint,
  tone = "neutral",
}: {
  title: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "warn" | "ok";
}) {
  const toneCls =
    tone === "warn"
      ? "border-red-300/60 bg-red-50/70 dark:border-red-900/40 dark:bg-red-950/25"
      : tone === "ok"
        ? "border-emerald-300/60 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/25"
        : "border-white/40 bg-white/35 dark:border-white/10 dark:bg-white/[0.04]";

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${toneCls}`}>
      <p className={`${labelCls} mb-0.5`}>{title}</p>
      <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">{hint}</p> : null}
    </div>
  );
}

export default function MelosaFluxoPanel({ token, ativo, obraCodigo = "" }: Props) {
  const [fluxo, setFluxo] = useState<MelosaFluxoResposta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFluxo = useCallback(async () => {
    if (!token || !ativo.trim()) {
      setFluxo(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ ativo: ativo.trim() });
      if (obraCodigo) params.set("obra_codigo", obraCodigo);
      const data = await apiGet<MelosaFluxoResposta>(`/v1/melosa-ciclos/fluxo?${params}`, token);
      setFluxo(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar análise de fluxo.");
      setFluxo(null);
    } finally {
      setLoading(false);
    }
  }, [token, ativo, obraCodigo]);

  useEffect(() => {
    void loadFluxo();
  }, [loadFluxo]);

  const eventosComAlerta = fluxo?.eventos.filter((e) => e.alertas.length > 0) ?? [];

  return (
    <section className={`${glassPanel} p-4 md:p-5`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4 border-b border-white/30 pb-4 dark:border-white/10">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-indigo-600/10 p-2 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
            <Fuel className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Análise de fluxo — tanque → melosa → equipamentos
            </h2>
            {ativo.trim() ? (
              <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                Melosa: <strong>{ativo.trim()}</strong>
                {loading ? " · carregando…" : null}
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                Use o filtro da dashboard para selecionar uma melosa.
              </p>
            )}
          </div>
        </div>
      </div>

      {!ativo.trim() ? (
        <p className="rounded-xl border border-dashed border-slate-300/80 px-4 py-8 text-center text-sm text-slate-500 dark:border-white/15 dark:text-slate-400">
          Informe uma melosa no filtro acima para ver o fluxo completo.
        </p>
      ) : null}

      {error ? (
        <p className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {fluxo && ativo.trim() ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatMini
              title="Saldo no tanque"
              value={`${fmtLitrosDashboard(fluxo.resumo.saldo_tanque_atual)} L`}
              hint="Após todos os eventos listados"
            />
            <StatMini
              title="Saldo na melosa"
              value={`${fmtLitrosDashboard(fluxo.resumo.saldo_melosa_atual)} L`}
              hint={
                fluxo.capacidade_litros != null
                  ? `Estimado · máx. ${fmtLitrosDashboard(fluxo.capacidade_litros)} L`
                  : "Estimado pelos registros"
              }
              tone={
                fluxo.capacidade_litros != null &&
                fluxo.resumo.saldo_melosa_atual > fluxo.capacidade_litros
                  ? "warn"
                  : "ok"
              }
            />
            <StatMini
              title="Abastecimentos"
              value={`${fmtLitrosDashboard(fluxo.resumo.total_abastecimentos)} L`}
              hint="Total para equipamentos"
            />
            <StatMini
              title="Alertas no fluxo"
              value={String(fluxo.resumo.alertas_count)}
              hint="Inconsistências de capacidade ou saldo"
              tone={fluxo.resumo.alertas_count > 0 ? "warn" : "ok"}
            />
          </div>

          {eventosComAlerta.length > 0 ? (
            <div className="rounded-xl border border-red-300/70 bg-red-50/60 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/25">
              <p className="mb-2 flex items-center gap-2 text-sm font-bold text-red-800 dark:text-red-300">
                <AlertTriangle className="h-4 w-4" />
                {eventosComAlerta.length} evento{eventosComAlerta.length === 1 ? "" : "s"} com inconsistência
              </p>
              <ul className="space-y-2 text-sm text-red-900 dark:text-red-200">
                {eventosComAlerta.map((ev) => (
                  <li key={ev.id}>
                    <span className="font-semibold">{fmtDataBr(ev.data_hora)}</span> — {ev.titulo}
                    <ul className="mt-0.5 list-disc pl-5 text-xs">
                      {ev.alertas.map((a, i) => (
                        <li key={`${ev.id}-a-${i}`}>{a}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {fluxo.por_dia.length > 0 ? (
            <div>
              <p className={`${labelCls} mb-2`}>Resumo por dia</p>
              <div className="overflow-auto rounded-xl border border-white/30 dark:border-white/10">
                <table className="w-full min-w-[520px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-white/50 text-left text-xs font-bold uppercase text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
                      <th className="px-3 py-2">Dia</th>
                      <th className="px-3 py-2">Abastecimentos</th>
                      <th className="px-3 py-2">Litros (equip.)</th>
                      <th className="px-3 py-2">Melosa (fim do dia)</th>
                      <th className="px-3 py-2">Tanque (fim do dia)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fluxo.por_dia.map((dia) => (
                      <tr
                        key={dia.data}
                        className="border-t border-white/25 dark:border-white/5"
                      >
                        <td className="px-3 py-2 font-medium">{dia.data}</td>
                        <td className="px-3 py-2 tabular-nums">{dia.abastecimentos_count}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {fmtLitrosDashboard(dia.litros_abastecidos)} L
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {fmtLitrosDashboard(dia.saldo_melosa_fim_dia)} L
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {fmtLitrosDashboard(dia.saldo_tanque_fim_dia)} L
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div>
            <p className={`${labelCls} mb-3`}>Linha do tempo ({fluxo.eventos.length} eventos)</p>
            {fluxo.eventos.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Nenhum movimento encontrado para esta melosa.
              </p>
            ) : (
              <ol className="relative space-y-0 border-l-2 border-slate-300/60 pl-6 dark:border-slate-600/60">
                {fluxo.eventos.map((ev) => {
                  const Icon = iconeEvento(ev.tipo);
                  const temAlerta = ev.alertas.length > 0;
                  return (
                    <li key={ev.id} className="relative pb-5 last:pb-0">
                      <span
                        className={`absolute -left-[1.65rem] flex h-7 w-7 items-center justify-center rounded-full border-2 bg-white dark:bg-slate-900 ${
                          temAlerta
                            ? "border-red-500 text-red-600 dark:text-red-400"
                            : "border-slate-400 text-slate-600 dark:border-slate-500 dark:text-slate-300"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className={`rounded-xl border px-4 py-3 ${corEvento(ev.tipo, temAlerta)}`}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">{ev.titulo}</p>
                            <p className="text-xs text-slate-600 dark:text-slate-400">
                              {fmtDataBr(ev.data_hora)}
                              {ev.ciclo_numero != null ? ` · Ciclo ID ${ev.ciclo_numero}` : ""}
                            </p>
                            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{ev.subtitulo}</p>
                          </div>
                          <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">
                            {ev.tipo === "abastecimento_equip" ? (
                              <span className="inline-flex items-center gap-0.5 text-red-700 dark:text-red-300">
                                <ArrowDown className="h-4 w-4" />
                                {fmtLitrosDashboard(ev.litros)} L
                              </span>
                            ) : ev.tipo === "enchimento_melosa" ? (
                              <span className="inline-flex items-center gap-0.5 text-amber-800 dark:text-amber-300">
                                <ArrowUp className="h-4 w-4" />
                                {fmtLitrosDashboard(ev.litros)} L
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 text-sky-800 dark:text-sky-300">
                                <ArrowUp className="h-4 w-4" />
                                {fmtLitrosDashboard(ev.litros)} L
                              </span>
                            )}
                          </p>
                        </div>

                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <div className="rounded-lg bg-white/50 px-3 py-2 text-xs dark:bg-black/20">
                            <span className="font-semibold text-slate-600 dark:text-slate-400">Tanque após: </span>
                            <strong className="tabular-nums">
                              {fmtLitrosDashboard(ev.saldo_tanque)} L
                            </strong>
                          </div>
                          <div className="rounded-lg bg-white/50 px-3 py-2 text-xs dark:bg-black/20">
                            <span className="font-semibold text-slate-600 dark:text-slate-400">Melosa após: </span>
                            <strong
                              className={`tabular-nums ${
                                ev.capacidade_melosa != null &&
                                ev.saldo_melosa > ev.capacidade_melosa
                                  ? "text-red-700 dark:text-red-300"
                                  : ""
                              }`}
                            >
                              {fmtLitrosDashboard(ev.saldo_melosa)} L
                            </strong>
                            {ev.capacidade_melosa != null ? (
                              <span className="text-slate-500"> / máx. {fmtLitrosDashboard(ev.capacidade_melosa)} L</span>
                            ) : null}
                          </div>
                        </div>

                        {ev.alertas.length > 0 ? (
                          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-red-800 dark:text-red-300">
                            {ev.alertas.map((a, i) => (
                              <li key={`${ev.id}-alert-${i}`}>{a}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
