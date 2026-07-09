import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Droplets,
  Gauge,
  Loader2,
  Minus,
  RefreshCw,
  ShieldCheck,
  Target,
  Truck,
} from "lucide-react";
import ConsumoMedioMetasModal from "../consumoMedio/ConsumoMedioMetasModal";
import ConsumoEquipamentoDetalhe from "../consumoMedio/ConsumoEquipamentoDetalhe";
import ConsumoMedioAlertasPanel from "../consumoMedio/ConsumoMedioAlertasPanel";
import ConsumoMedioEquipamentosTable from "../consumoMedio/ConsumoMedioEquipamentosTable";
import ConsumoMedioKpiCard from "../consumoMedio/ConsumoMedioKpiCard";
import ConsumoMedioQualidadePanel from "../consumoMedio/ConsumoMedioQualidadePanel";
import ConsumoMedioRankingPanel, { ConsumoMedioRankingHeader } from "../consumoMedio/ConsumoMedioRankingPanel";
import ConsumoMedioHero, {
  ConsumoMedioSectionTitle,
  ConsumoMedioTabBar,
} from "../consumoMedio/ConsumoMedioHero";
import { fmtDataBr, fmtMedia, fmtUnidade, labelCls, tdCls, thCls } from "../consumoMedio/consumoMedioUi";
import { useAuth } from "../../state/useAuth";
import { apiGet } from "../../lib/api";
import { fmtLitrosDashboard } from "../../lib/combustivelControle";
import { defaultPeriodoMesAtual, parseDateInputValue, toDateInputValue } from "../../lib/aggregateCombustivelDashboard";
import {
  analisarEquipamento,
  badgeClasses,
  buildAlertas,
  calcSaudeDados,
  mediaFrotaPorUnidade,
  nivelCorClasses,
  ordenarEquipamentos,
  type ConsumoMeta,
  type EquipamentoConsumoResposta,
  type MetaEquipamento,
  type OrdenacaoConsumo,
} from "../../lib/consumoMedioAnalise";
import { downloadConsumoMedioExcel } from "../../lib/consumoMedioExcel";
import { glassField, glassPanel, glassSelect } from "../../lib/glass";

export type { ConsumoEquipamento, ConsumoTrecho, EquipamentoConsumoResposta } from "../../lib/consumoMedioAnalise";

type Props = {
  token: string | null;
  variant?: "embedded" | "page";
};

type TabId = "visao" | "equipamentos" | "qualidade";

function VariacaoBadge({ pct }: { pct: number | null }) {
  if (pct == null || !Number.isFinite(pct)) return <span className="text-slate-400">—</span>;
  const abs = Math.abs(pct);
  const label = `${pct > 0 ? "+" : ""}${Math.round(pct * 100)}%`;
  if (abs < 0.05) {
    return (
      <span className="inline-flex items-center gap-0.5 text-slate-500">
        <Minus className="h-3 w-3" />
        {label}
      </span>
    );
  }
  if (pct > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 font-semibold text-red-700 dark:text-red-400">
        <ArrowUp className="h-3 w-3" />
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 font-semibold text-emerald-700 dark:text-emerald-400">
      <ArrowDown className="h-3 w-3" />
      {label}
    </span>
  );
}

export default function EquipamentoConsumoPanel({ token, variant = "embedded" }: Props) {
  const isPage = variant === "page";
  const { isAdmin, canAccessObra } = useAuth();
  const periodoInicial = useMemo(() => defaultPeriodoMesAtual(), []);
  const [de, setDe] = useState(toDateInputValue(periodoInicial.de));
  const [ate, setAte] = useState(toDateInputValue(periodoInicial.ate));
  const [filtroAtivo, setFiltroAtivo] = useState("");
  const [filtroObra, setFiltroObra] = useState("");
  const [filtroMelosa, setFiltroMelosa] = useState("");
  const [obrasOpcoes, setObrasOpcoes] = useState<{ codigo: number; nome: string }[]>([]);
  const [melosasOpcoes, setMelosasOpcoes] = useState<{ ativo: string; nome: string | null }[]>([]);
  const [filtroEmpresa, setFiltroEmpresa] = useState("");
  const [filtroUnidade, setFiltroUnidade] = useState<"" | "h" | "km">("");
  const [somenteAlertas, setSomenteAlertas] = useState(false);
  const [compararPeriodo, setCompararPeriodo] = useState(true);
  const [ordenacao, setOrdenacao] = useState<OrdenacaoConsumo>("media_desc");
  const [tab, setTab] = useState<TabId>("visao");
  const [data, setData] = useState<EquipamentoConsumoResposta | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAtivo, setSelectedAtivo] = useState<string | null>(null);
  const [metasOpen, setMetasOpen] = useState(false);
  const [metasLocal, setMetasLocal] = useState<ConsumoMeta[]>([]);
  const [metasEquipamento, setMetasEquipamento] = useState<Record<string, MetaEquipamento>>({});

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        const [obrasRes, melosasRes] = await Promise.all([
          apiGet<{ obras: { codigo: number; nome: string }[] }>("/v1/obras", token),
          apiGet<{ equipamentos: { ativo: string; nome: string | null }[] }>(
            "/v1/equipamentos?tipo=MELOSA",
            token,
          ),
        ]);
        if (cancelled) return;
        setObrasOpcoes(
          (obrasRes.obras ?? [])
            .filter((o) => canAccessObra(o.codigo))
            .sort((a, b) => a.codigo - b.codigo),
        );
        setMelosasOpcoes(
          [...(melosasRes.equipamentos ?? [])].sort((a, b) => a.ativo.localeCompare(b.ativo, "pt-BR")),
        );
      } catch {
        if (!cancelled) {
          setObrasOpcoes([]);
          setMelosasOpcoes([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, canAccessObra]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (de) params.set("de", de);
      if (ate) params.set("ate", ate);
      if (filtroAtivo.trim()) params.set("ativo", filtroAtivo.trim());
      if (filtroObra) params.set("obra_codigo", filtroObra);
      if (filtroMelosa.trim()) params.set("melosa", filtroMelosa.trim());
      if (compararPeriodo) params.set("comparar", "1");
      const res = await apiGet<EquipamentoConsumoResposta>(`/v1/equipamentos/consumo?${params}`, token);
      setData(res);
      setMetasLocal(res.metas ?? []);
      setMetasEquipamento(res.metas_equipamento ?? {});
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar consumo por equipamento.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token, de, ate, filtroAtivo, filtroObra, filtroMelosa, compararPeriodo]);

  useEffect(() => {
    void load();
  }, [load]);

  const mediaFrotaH = useMemo(() => mediaFrotaPorUnidade(data?.equipamentos ?? [], "h"), [data?.equipamentos]);
  const mediaFrotaKm = useMemo(() => mediaFrotaPorUnidade(data?.equipamentos ?? [], "km"), [data?.equipamentos]);

  const analises = useMemo(() => {
    const map = new Map<string, ReturnType<typeof analisarEquipamento>>();
    if (!data) return map;
    data.equipamentos.forEach((eq) => {
      map.set(
        eq.ativo,
        analisarEquipamento(eq, {
          metas: metasLocal,
          metasEquipamento,
          mediaFrotaH,
          mediaFrotaKm,
          periodoAnterior: data.periodo_anterior,
        }),
      );
    });
    return map;
  }, [data, mediaFrotaH, mediaFrotaKm, metasEquipamento, metasLocal]);

  const alertas = useMemo(() => (data ? buildAlertas(data, analises) : []), [analises, data]);

  const empresasUnicas = useMemo(
    () =>
      Array.from(new Set((data?.equipamentos ?? []).map((e) => e.empresa).filter(Boolean) as string[])).sort(),
    [data?.equipamentos],
  );

  const equipamentosFiltrados = useMemo(() => {
    let list = [...(data?.equipamentos ?? [])];
    if (filtroEmpresa) list = list.filter((e) => e.empresa === filtroEmpresa);
    if (filtroUnidade) list = list.filter((e) => e.unidade === filtroUnidade);
    if (somenteAlertas) list = list.filter((e) => analises.get(e.ativo)?.temAlerta);
    return ordenarEquipamentos(list, ordenacao);
  }, [analises, data?.equipamentos, filtroEmpresa, filtroUnidade, ordenacao, somenteAlertas]);

  const saude = useMemo(() => (data ? calcSaudeDados(data) : null), [data]);

  const resumo = useMemo(() => {
    const comMedia = equipamentosFiltrados.filter((eq) => eq.media_litros_por_unidade != null);
    const totalLitros = equipamentosFiltrados.reduce((acc, eq) => acc + eq.total_litros_periodo, 0);
    const maior = comMedia[0] ?? null;
    const alertasAtivos = equipamentosFiltrados.filter((e) => analises.get(e.ativo)?.temAlerta).length;
    return {
      comMedia: comMedia.length,
      totalLitros,
      maior,
      semHorimetro: data?.sem_dados_horimetro ?? 0,
      alertasAtivos,
      alertasTotal: alertas.filter((a) => a.severidade !== "info").length,
    };
  }, [alertas, analises, data?.sem_dados_horimetro, equipamentosFiltrados]);

  const equipamentoSelecionado = useMemo(
    () => equipamentosFiltrados.find((e) => e.ativo === selectedAtivo) ?? null,
    [equipamentosFiltrados, selectedAtivo],
  );

  const handleExport = useCallback(async () => {
    if (!data) return;
    setExporting(true);
    try {
      await downloadConsumoMedioExcel(data, equipamentosFiltrados, alertas);
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : "Erro ao exportar Excel.");
    } finally {
      setExporting(false);
    }
  }, [alertas, data, equipamentosFiltrados]);

  const alertasRelevantes = alertas.filter((a) => a.severidade !== "info").length;

  return (
    <div className={isPage ? "page-shell" : "space-y-5"}>
      {isPage ? (
        <>
          <ConsumoMedioHero
            de={de}
            ate={ate}
            filtroAtivo={filtroAtivo}
            filtroObra={filtroObra}
            filtroMelosa={filtroMelosa}
            obras={obrasOpcoes}
            melosas={melosasOpcoes}
            compararPeriodo={compararPeriodo}
            loading={loading}
            exporting={exporting}
            canExport={!!data}
            onDeChange={setDe}
            onAteChange={setAte}
            onFiltroAtivoChange={setFiltroAtivo}
            onFiltroObraChange={setFiltroObra}
            onFiltroMelosaChange={setFiltroMelosa}
            onCompararChange={setCompararPeriodo}
            onRefresh={() => void load()}
            onMetas={() => setMetasOpen(true)}
            onExport={() => void handleExport()}
          />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <ConsumoMedioKpiCard
              label="Com média calculada"
              value={resumo.comMedia}
              hint={`${equipamentosFiltrados.length} no filtro atual`}
              icon={Truck}
              tone="sky"
            />
            <ConsumoMedioKpiCard
              label="Litros nos trechos"
              value={`${fmtLitrosDashboard(resumo.totalLitros)} L`}
              icon={Droplets}
              tone="neutral"
            />
            <ConsumoMedioKpiCard
              label="Alertas ativos"
              value={resumo.alertasTotal}
              hint={resumo.alertasTotal === 0 ? "Frota estável" : "Requer atenção"}
              icon={AlertTriangle}
              tone={resumo.alertasTotal > 0 ? "amber" : "emerald"}
            />
            <ConsumoMedioKpiCard
              label="Maior consumo"
              value={
                resumo.maior ? (
                  <span className="text-base sm:text-xl">
                    {resumo.maior.ativo}{" "}
                    <span className="font-semibold text-orange-600 dark:text-orange-400">
                      ({fmtMedia(resumo.maior.media_litros_por_unidade, resumo.maior.unidade)})
                    </span>
                  </span>
                ) : (
                  "—"
                )
              }
              icon={Target}
              tone="orange"
            />
            <ConsumoMedioKpiCard
              label="Saúde dos dados"
              value={saude ? `${Math.round(saude.pctHorimetro)}%` : "—"}
              hint="horímetro válido"
              icon={ShieldCheck}
              tone={saude && saude.pctHorimetro >= 80 ? "emerald" : "amber"}
            />
          </div>

          <ConsumoMedioTabBar
            tab={tab}
            onTabChange={setTab}
            alertasCount={alertasRelevantes}
            equipamentosCount={equipamentosFiltrados.length}
          />

          {error ? (
            <p className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          ) : null}

          {loading && !data ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/50 bg-white/40 py-20 text-slate-500 dark:border-white/10 dark:bg-black/20">
              <Loader2 className="h-6 w-6 animate-spin" />
              Carregando análise de consumo…
            </div>
          ) : null}
        </>
      ) : null}

      {isPage && tab === "visao" && data ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <section className={`${glassPanel} p-5`}>
            <ConsumoMedioSectionTitle
              icon={AlertTriangle}
              title="Alertas e atenção"
              description="Consumo acima da meta, picos, variação e qualidade dos registros."
            />
            <ConsumoMedioAlertasPanel alertas={alertas} onSelectAtivo={setSelectedAtivo} />
          </section>
          <section className={`${glassPanel} p-5`}>
            <ConsumoMedioRankingHeader />
            <ConsumoMedioRankingPanel
              equipamentos={equipamentosFiltrados}
              analises={analises}
              onSelect={setSelectedAtivo}
            />
          </section>
        </div>
      ) : null}

      {isPage && tab === "equipamentos" ? (
        <section className={`${glassPanel} p-4 sm:p-5`}>
          <ConsumoMedioSectionTitle
            icon={BarChart3}
            title="Frota no período"
            description="Clique em uma linha para abrir o detalhe com gráfico mensal, meta e trechos."
          />

          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200/60 bg-slate-50/50 p-3 dark:border-white/10 dark:bg-black/15">
            <label className="filter-field-md">
              <span className={labelCls}>Empresa</span>
              <select className={glassSelect} value={filtroEmpresa} onChange={(e) => setFiltroEmpresa(e.target.value)}>
                <option value="">Todas</option>
                {empresasUnicas.map((emp) => (
                  <option key={emp} value={emp}>
                    {emp}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              <span className={labelCls}>Unidade</span>
              <select className={glassSelect} value={filtroUnidade} onChange={(e) => setFiltroUnidade(e.target.value as "" | "h" | "km")}>
                <option value="">Todas</option>
                <option value="h">L/h</option>
                <option value="km">L/km</option>
              </select>
            </label>
            <label className="filter-field-md">
              <span className={labelCls}>Ordenar por</span>
              <select className={glassSelect} value={ordenacao} onChange={(e) => setOrdenacao(e.target.value as OrdenacaoConsumo)}>
                <option value="media_desc">Maior média</option>
                <option value="litros_desc">Mais litros</option>
                <option value="trechos_desc">Mais trechos</option>
                <option value="ultimo_abast">Último abastecimento</option>
              </select>
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={somenteAlertas} onChange={(e) => setSomenteAlertas(e.target.checked)} />
              Só com alerta
            </label>
          </div>

          {compararPeriodo && data?.periodo_anterior ? (
            <p className="mb-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Activity className="h-3.5 w-3.5" aria-hidden />
              Período anterior: {parseDateInputValue(data.periodo_anterior.de)?.toLocaleDateString("pt-BR")} a{" "}
              {parseDateInputValue(data.periodo_anterior.ate)?.toLocaleDateString("pt-BR")}
            </p>
          ) : null}

          <ConsumoMedioEquipamentosTable
            equipamentos={equipamentosFiltrados}
            analises={analises}
            compararPeriodo={compararPeriodo}
            selectedAtivo={selectedAtivo}
            loading={loading}
            onSelect={setSelectedAtivo}
          />
        </section>
      ) : null}

      {isPage && tab === "qualidade" && data ? (
        <section className={`${glassPanel} p-4 sm:p-5`}>
          <ConsumoMedioSectionTitle
            icon={ShieldCheck}
            title="Qualidade dos dados"
            description="Confiabilidade das leituras de horímetro usadas no cálculo de média."
          />
          <ConsumoMedioQualidadePanel data={data} de={de} ate={ate} />
        </section>
      ) : null}
      {!isPage ? (
        <section className={`${glassPanel} p-4 md:p-5`}>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4 border-b border-white/30 pb-4 dark:border-white/10">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-orange-600/10 p-2 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400">
                <Gauge className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Consumo médio por equipamento</h2>
                <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                  Litros entre leituras consecutivas do horímetro.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-60 dark:border-white/20 dark:bg-black/20 dark:text-slate-100"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Atualizando…" : "Atualizar"}
            </button>
          </div>

          <div className="mb-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className={labelCls}>De</span>
              <input type="date" className={glassField} value={de} onChange={(e) => setDe(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Até</span>
              <input type="date" className={glassField} value={ate} onChange={(e) => setAte(e.target.value)} />
            </label>
            <label className="filter-field">
              <span className={labelCls}>Equipamento</span>
              <input
                className={glassField}
                placeholder="Ex.: REVTR01"
                value={filtroAtivo}
                onChange={(e) => setFiltroAtivo(e.target.value)}
              />
            </label>
            <label className="filter-field-md">
              <span className={labelCls}>Obra</span>
              <select className={glassSelect} value={filtroObra} onChange={(e) => setFiltroObra(e.target.value)}>
                <option value="">Todas</option>
                {obrasOpcoes.map((o) => (
                  <option key={o.codigo} value={String(o.codigo)}>
                    {o.codigo} — {o.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field-md">
              <span className={labelCls}>Melosa</span>
              <select className={glassSelect} value={filtroMelosa} onChange={(e) => setFiltroMelosa(e.target.value)}>
                <option value="">Todas</option>
                {melosasOpcoes.map((m) => (
                  <option key={m.ativo} value={m.ativo}>
                    {m.ativo}
                    {m.nome ? ` — ${m.nome}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={compararPeriodo} onChange={(e) => setCompararPeriodo(e.target.checked)} />
              Comparar período anterior
            </label>
          </div>

          {compararPeriodo && data?.periodo_anterior ? (
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              Período anterior: {parseDateInputValue(data.periodo_anterior.de)?.toLocaleDateString("pt-BR")} a{" "}
              {parseDateInputValue(data.periodo_anterior.ate)?.toLocaleDateString("pt-BR")}
            </p>
          ) : null}

          {error ? (
            <p className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </p>
          ) : null}

          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            {equipamentosFiltrados.length} equipamento{equipamentosFiltrados.length === 1 ? "" : "s"}
            {resumo.semHorimetro ? ` · ${resumo.semHorimetro} sem horímetro válido` : ""}
          </p>

          {loading && !data ? (
            <div className="flex items-center justify-center gap-2 py-12 text-slate-500 dark:text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              Carregando consumo…
            </div>
          ) : null}

          <div
            className="table-scroll overflow-auto rounded-xl border border-white/30 dark:border-white/10"
            style={{ maxHeight: "min(28rem, 55vh)" }}
          >
            <table className="w-max min-w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={thCls}>Equipamento</th>
                  <th className={thCls}>Nome</th>
                  <th className={thCls}>Status</th>
                  <th className={thCls}>Média</th>
                  {compararPeriodo ? <th className={thCls}>vs anterior</th> : null}
                  <th className={thCls}>Meta</th>
                  <th className={thCls}>Litros</th>
                  <th className={thCls}>Horas/km</th>
                  <th className={thCls}>Trechos</th>
                  <th className={thCls}>Último abast.</th>
                </tr>
              </thead>
              <tbody>
                {equipamentosFiltrados.map((eq, idx) => {
                  const zebra = idx % 2 === 0 ? "bg-transparent" : "bg-white/30 dark:bg-white/[0.04]";
                  const analise = analises.get(eq.ativo);
                  return (
                    <tr
                      key={eq.ativo}
                      className={`${zebra} cursor-pointer hover:bg-orange-50/50 dark:hover:bg-orange-950/20`}
                      onClick={() => setSelectedAtivo(eq.ativo)}
                    >
                      <td className={`${tdCls} font-bold`}>{eq.ativo}</td>
                      <td className={tdCls}>{eq.nome ?? "—"}</td>
                      <td className={tdCls}>
                        <div className="flex max-w-[180px] flex-wrap gap-1">
                          {analise?.badges.length ? (
                            analise.badges.map((b) => (
                              <span
                                key={b.key}
                                className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${badgeClasses(b.severidade)}`}
                              >
                                {b.label}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-emerald-600 dark:text-emerald-400">OK</span>
                          )}
                        </div>
                      </td>
                      <td className={`${tdCls} font-semibold tabular-nums ${nivelCorClasses(analise?.nivel ?? "ok")}`}>
                        {fmtMedia(eq.media_litros_por_unidade, eq.unidade)}
                      </td>
                      {compararPeriodo ? (
                        <td className={tdCls}>
                          <VariacaoBadge pct={analise?.variacaoPeriodo ?? null} />
                        </td>
                      ) : null}
                      <td className={`${tdCls} tabular-nums text-slate-600 dark:text-slate-400`}>
                        {analise?.meta != null ? (
                          <>
                            {fmtMedia(analise.meta, eq.unidade)}
                            {analise.metaOrigem === "equipamento" ? (
                              <span className="ml-1 text-[10px] text-orange-600">●</span>
                            ) : null}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={`${tdCls} tabular-nums`}>{fmtLitrosDashboard(eq.total_litros_periodo)} L</td>
                      <td className={`${tdCls} tabular-nums`}>{fmtUnidade(eq.total_unidade, eq.unidade)}</td>
                      <td className={`${tdCls} tabular-nums`}>{eq.trechos_count}</td>
                      <td className={`${tdCls} whitespace-nowrap`}>{fmtDataBr(eq.ultimo_abastecimento)}</td>
                    </tr>
                  );
                })}
                {equipamentosFiltrados.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={compararPeriodo ? 10 : 9} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                      Nenhum equipamento encontrado com os filtros atuais.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {token && selectedAtivo ? (
        <ConsumoEquipamentoDetalhe
          ativo={selectedAtivo}
          equipamentoResumo={equipamentoSelecionado}
          token={token}
          de={de}
          ate={ate}
          obraCodigo={filtroObra || null}
          melosa={filtroMelosa || null}
          data={data}
          onClose={() => setSelectedAtivo(null)}
          onMetaSaved={(meta) => {
            setMetasEquipamento((prev) => ({ ...prev, [meta.ativo]: meta }));
            if (data) setData({ ...data, metas_equipamento: { ...data.metas_equipamento, [meta.ativo]: meta } });
          }}
        />
      ) : null}

      {token && isPage ? (
        <ConsumoMedioMetasModal
          open={metasOpen}
          metas={metasLocal}
          token={token}
          isAdmin={isAdmin}
          onClose={() => setMetasOpen(false)}
          onSaved={(metas) => {
            setMetasLocal(metas);
            if (data) setData({ ...data, metas });
          }}
        />
      ) : null}
    </div>
  );
}
