import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ExternalLink,
  Gauge,
  Loader2,
  Save,
  Target,
  X,
} from "lucide-react";
import ConsumoMensalChart from "./ConsumoMensalChart";
import ConsumoMedioMetaBar from "./ConsumoMedioMetaBar";
import { apiGet, apiPut } from "../../lib/api";
import { fmtLitrosDashboard } from "../../lib/combustivelControle";
import {
  analisarEquipamento,
  badgeClasses,
  buildMelosaBiLink,
  type ConsumoEquipamento,
  type EquipamentoConsumoDetalhe,
  type EquipamentoConsumoResposta,
  type MetaEquipamento,
} from "../../lib/consumoMedioAnalise";
import { glassField, glassPanel } from "../../lib/glass";

type Props = {
  ativo: string;
  equipamentoResumo: ConsumoEquipamento | null;
  token: string;
  de: string;
  ate: string;
  obraCodigo?: string | null;
  melosa?: string | null;
  data: EquipamentoConsumoResposta | null;
  onClose: () => void;
  onMetaSaved: (meta: MetaEquipamento) => void;
};

const labelCls =
  "text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400";

function fmtMedia(v: number | null, unidade: string): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const label = unidade === "km" ? "L/km" : "L/h";
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${label}`;
}

function fmtDataBr(v: string | null): string {
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

export default function ConsumoEquipamentoDetalhe({
  ativo,
  equipamentoResumo,
  token,
  de,
  ate,
  obraCodigo,
  melosa,
  data,
  onClose,
  onMetaSaved,
}: Props) {
  const [detalhe, setDetalhe] = useState<EquipamentoConsumoDetalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metaDraft, setMetaDraft] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);
  const [metaMsg, setMetaMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ ativo, meses: "12" });
      if (de) params.set("de", de);
      if (ate) params.set("ate", ate);
      if (obraCodigo) params.set("obra_codigo", obraCodigo);
      if (melosa?.trim()) params.set("melosa", melosa.trim());
      const res = await apiGet<EquipamentoConsumoDetalhe>(
        `/v1/equipamentos/consumo/detalhe?${params}`,
        token,
      );
      setDetalhe(res);
      const metaVal = res.meta_equipamento?.meta_litros_por_unidade ?? res.meta_efetiva;
      setMetaDraft(metaVal != null ? String(metaVal) : "");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar equipamento.");
      setDetalhe(null);
    } finally {
      setLoading(false);
    }
  }, [ativo, ate, de, melosa, obraCodigo, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const eq = detalhe?.equipamento ?? equipamentoResumo;

  const analise = useMemo(() => {
    if (!eq || !data) return null;
    return analisarEquipamento(eq, {
      metas: data.metas,
      metasEquipamento: data.metas_equipamento ?? {},
      mediaFrotaH: null,
      mediaFrotaKm: null,
      periodoAnterior: data.periodo_anterior,
    });
  }, [data, eq]);

  const salvarMeta = useCallback(
    async (usarMedia: boolean) => {
      setSavingMeta(true);
      setMetaMsg(null);
      try {
        const body = usarMedia
          ? { usar_media_periodo: true, de: de || null, ate: ate || null }
          : {
              meta_litros_por_unidade: Number(metaDraft.replace(",", ".")),
              de: de || null,
              ate: ate || null,
            };
        if (!usarMedia) {
          const metaVal = Number(metaDraft.replace(",", "."));
          if (!Number.isFinite(metaVal) || metaVal <= 0) {
            throw new Error("Informe uma meta válida.");
          }
        }
        const res = await apiPut<{ meta: MetaEquipamento }>(
          `/v1/equipamentos/consumo/metas-equipamento/${encodeURIComponent(ativo)}`,
          token,
          body,
        );
        onMetaSaved(res.meta);
        setMetaDraft(String(res.meta.meta_litros_por_unidade));
        setMetaMsg(usarMedia ? "Meta definida pela média do período." : "Meta salva.");
        await load();
      } catch (err: unknown) {
        setMetaMsg(err instanceof Error ? err.message : "Erro ao salvar meta.");
      } finally {
        setSavingMeta(false);
      }
    },
    [ativo, ate, de, load, metaDraft, onMetaSaved, token],
  );

  const pico =
    eq && eq.trechos.length > 0
      ? eq.trechos.reduce((max, t) => (t.litros_por_unidade > max.litros_por_unidade ? t : max), eq.trechos[0])
      : null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consumo-equipamento-titulo"
      onClick={onClose}
    >
      <div
        className={`flex max-h-[min(92vh,52rem)] w-full max-w-[min(100%,52rem)] flex-col overflow-hidden rounded-2xl shadow-2xl ${glassPanel}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-orange-200/50 bg-gradient-to-r from-orange-50/80 to-transparent px-5 py-4 dark:border-orange-900/30 dark:from-orange-950/30">
          <div className="rounded-lg bg-orange-600/10 p-2 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400">
            <Gauge className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="consumo-equipamento-titulo" className="truncate text-lg font-bold text-slate-900 dark:text-white">
              {ativo}
            </h2>
            {eq ? (
              <p className="mt-0.5 truncate text-sm text-slate-600 dark:text-slate-400">
                {eq.nome ?? "Sem nome"}
                {eq.empresa ? ` · ${eq.empresa}` : ""}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200/80 dark:hover:bg-white/10"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin" />
              Carregando equipamento…
            </div>
          ) : error ? (
            <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          ) : eq ? (
            <>
              <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,280px)]">
                <div className="rounded-2xl border border-slate-200/70 bg-white/50 p-4 dark:border-white/10 dark:bg-black/20">
                  <p className={labelCls}>Consumo vs meta</p>
                  <div className="mt-3">
                    <ConsumoMedioMetaBar
                      media={eq.media_litros_por_unidade}
                      meta={detalhe?.meta_efetiva ?? analise?.meta ?? null}
                      unidade={eq.unidade}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/30 bg-white/25 p-3 dark:border-white/10 dark:bg-black/15">
                    <p className={labelCls}>Litros</p>
                    <p className="mt-1 text-lg font-bold tabular-nums">{fmtLitrosDashboard(eq.total_litros_periodo)} L</p>
                  </div>
                  <div className="rounded-xl border border-white/30 bg-white/25 p-3 dark:border-white/10 dark:bg-black/15">
                    <p className={labelCls}>Trechos</p>
                    <p className="mt-1 text-lg font-bold tabular-nums">{eq.trechos_count}</p>
                  </div>
                </div>
              </div>

              {analise?.badges.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {analise.badges.map((b) => (
                    <span
                      key={b.key}
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${badgeClasses(b.severidade)}`}
                    >
                      {b.label}
                    </span>
                  ))}
                </div>
              ) : null}

              <section className="rounded-xl border border-white/30 bg-white/20 p-4 dark:border-white/10 dark:bg-black/15">
                <div className="mb-3 flex items-center gap-2">
                  <Target className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Meta deste equipamento</h3>
                </div>
                <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">
                  Defina a meta com base na média atual ou informe um valor manual em{" "}
                  {eq.unidade === "km" ? "L/km" : "L/h"}.
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex min-w-[120px] flex-1 flex-col gap-1">
                    <span className={labelCls}>Valor da meta</span>
                    <input
                      className={glassField}
                      value={metaDraft}
                      onChange={(e) => setMetaDraft(e.target.value)}
                      placeholder={eq.media_litros_por_unidade != null ? String(eq.media_litros_por_unidade) : "0"}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={savingMeta || eq.media_litros_por_unidade == null}
                    onClick={() => void salvarMeta(true)}
                    className="rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-900 hover:bg-orange-100 disabled:opacity-50 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-200"
                  >
                    Usar média atual
                  </button>
                  <button
                    type="button"
                    disabled={savingMeta}
                    onClick={() => void salvarMeta(false)}
                    className="inline-flex items-center gap-1 rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
                  >
                    {savingMeta ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Salvar
                  </button>
                </div>
                {metaMsg ? <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-400">{metaMsg}</p> : null}
              </section>

              {detalhe ? (
                <ConsumoMensalChart
                  serie={detalhe.serie_mensal}
                  unidade={eq.unidade}
                  meta={detalhe.meta_efetiva}
                />
              ) : null}

              <section>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Trechos do período ({eq.trechos_count})
                  </h3>
                  <Link
                    to={buildMelosaBiLink(ativo, de, ate)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400"
                  >
                    <ExternalLink className="h-3 w-3" />
                      BI abastecimentos
                  </Link>
                </div>
                <div className="space-y-2">
                  {eq.trechos.map((t, ti) => {
                    const isPico = pico && t === pico;
                    return (
                      <div
                        key={ti}
                        className={`rounded-lg border p-3 text-xs ${
                          isPico
                            ? "border-orange-300/80 bg-orange-50/70 dark:border-orange-800/50 dark:bg-orange-950/25"
                            : "border-white/30 bg-white/20 dark:border-white/10 dark:bg-black/10"
                        }`}
                      >
                        <div className="flex justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-800 dark:text-slate-200">
                              {t.horimetro_inicio} → {t.horimetro_fim}
                              {isPico ? (
                                <span className="ml-1 rounded bg-orange-200 px-1 text-[10px] font-bold uppercase dark:bg-orange-900/50">
                                  Pico
                                </span>
                              ) : null}
                            </p>
                            <p className="text-slate-500">
                              {fmtDataBr(t.data_hora_inicio)} → {fmtDataBr(t.data_hora_fim)}
                            </p>
                          </div>
                          <p className="font-bold tabular-nums">{fmtMedia(t.litros_por_unidade, eq.unidade)}</p>
                        </div>
                        <p className="mt-1 text-slate-500">
                          {fmtLitrosDashboard(t.litros)} L · Δ {fmtLitrosDashboard(t.delta_unidade)}{" "}
                          {eq.unidade === "km" ? "km" : "h"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
