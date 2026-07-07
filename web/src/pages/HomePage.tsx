import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Droplets,
  EyeOff,
  Fuel,
  HardHat,
  LayoutDashboard,
  Pencil,
  RefreshCw,
  Trash2,
  TrendingDown,
  Gauge,
} from "lucide-react";
import DashboardAlertaCicloModal, {
  type DashboardAlertaCiclo,
} from "../components/dashboard/DashboardAlertaCicloModal";
import DashboardCard from "../components/dashboard/DashboardCard";
import MelosaFluxoPanel from "../components/dashboard/MelosaFluxoPanel";
import EstoqueCombustivelPanel from "../components/dashboard/EstoqueCombustivelPanel";
import DashboardResumoSection from "../components/dashboard/DashboardResumoSection";
import { useAuth } from "../state/AuthContext";
import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";
import { fmtLitrosDashboard } from "../lib/combustivelControle";
import {
  downloadDashboardCiclosExcel,
  type DashboardCicloExcelRow,
  type DashboardDesvioExcelRow,
} from "../lib/dashboardCiclosExcel";
import { glassField, glassPanel } from "../lib/glass";

type MelosaCiclo = {
  id: string;
  ciclo_numero: number;
  ativo_melosa_texto: string;
  ciclo_anterior_numero: number | null;
  data_hora: string;
  litros_retirada: number;
  litros_sobra_anterior: number;
  litros_abastecidos: number;
  litros_devolvidos: number;
  litros_sobra_atual: number;
  capacidade_litros: number | null;
  volume_excedente: number;
  status: "ok" | "suspeito";
  alerta_oculto?: boolean;
};

type MedidorDesvio = {
  operation_id: string;
  data_hora: string;
  ativo_melosa_texto: string;
  ativo_equipamento_texto: string | null;
  litros: number;
  melosa_quantidade_abastecida: string | null;
  medidor_final_anterior: number | null;
  medidor_desvio_litros: number | null;
  medidor_continuidade_status: string | null;
};

type DeleteTarget =
  | { kind: "ciclos"; ids: string[] }
  | { kind: "desvio"; desvio: MedidorDesvio }
  | { kind: "desvios"; operationIds: string[] };

const labelCls =
  "text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400";

const thCls =
  "sticky top-0 z-[1] whitespace-nowrap border-b border-white/30 bg-white/50 px-3 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300";

const tdCls =
  "border-b border-white/25 px-3 py-2 align-middle text-slate-800 dark:border-white/5 dark:text-slate-200";

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

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-4 flex items-start gap-3 border-b border-white/30 pb-4 dark:border-white/10">
      <div className="rounded-lg bg-blue-600/10 p-2 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: "ok" | "suspeito" }) {
  if (status === "suspeito") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950/50 dark:text-red-300">
        <AlertTriangle className="h-3 w-3" />
        Suspeito
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
      OK
    </span>
  );
}

export default function HomePage() {
  const { token, canAccessPage, isAdmin } = useAuth();
  const [ciclos, setCiclos] = useState<MelosaCiclo[]>([]);
  const [desviosMedidor, setDesviosMedidor] = useState<MedidorDesvio[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtroAtivo, setFiltroAtivo] = useState("");
  const [apenasSuspeitos, setApenasSuspeitos] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selectedCicloIds, setSelectedCicloIds] = useState<string[]>([]);
  const [selectedDesvioIds, setSelectedDesvioIds] = useState<string[]>([]);
  const [alertaEditCiclo, setAlertaEditCiclo] = useState<DashboardAlertaCiclo | null>(null);
  const [ocultandoAlertaId, setOcultandoAlertaId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (filtroAtivo.trim()) params.set("ativo", filtroAtivo.trim());
      if (apenasSuspeitos) params.set("suspeitos", "1");
      const desvioParams = new URLSearchParams({ limit: "100" });
      if (filtroAtivo.trim()) desvioParams.set("ativo", filtroAtivo.trim());

      const [jsonCiclos, jsonDesvios] = await Promise.all([
        apiGet<{ ciclos: MelosaCiclo[] }>(`/v1/melosa-ciclos?${params}`, token),
        apiGet<{ desvios: MedidorDesvio[] }>(`/v1/melosa-medidor/desvios?${desvioParams}`, token).catch(
          () => ({ desvios: [] as MedidorDesvio[] }),
        ),
      ]);
      setCiclos(jsonCiclos?.ciclos ?? []);
      setDesviosMedidor(jsonDesvios?.desvios ?? []);
      setSelectedCicloIds([]);
      setSelectedDesvioIds([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar ciclos.");
      setCiclos([]);
      setDesviosMedidor([]);
    } finally {
      setLoading(false);
    }
  }, [token, filtroAtivo, apenasSuspeitos]);

  const closeDeleteModal = useCallback(() => {
    if (deleteSaving) return;
    setDeleteTarget(null);
    setDeleteError(null);
  }, [deleteSaving]);

  const executeDelete = useCallback(async () => {
    if (!token || !deleteTarget) return;
    setDeleteSaving(true);
    setDeleteError(null);
    try {
      if (deleteTarget.kind === "ciclos") {
        if (deleteTarget.ids.length === 1) {
          await apiDelete(`/v1/melosa-ciclos/${deleteTarget.ids[0]}`, token);
        } else {
          await apiPost("/v1/melosa-ciclos/bulk-delete", token, { ids: deleteTarget.ids });
        }
      } else if (deleteTarget.kind === "desvios") {
        await Promise.all(
          deleteTarget.operationIds.map((operationId) =>
            apiDelete(`/v1/melosa/movimentacoes/${encodeURIComponent(operationId)}`, token),
          ),
        );
      } else {
        await apiDelete(
          `/v1/melosa/movimentacoes/${encodeURIComponent(deleteTarget.desvio.operation_id)}`,
          token,
        );
      }
      setDeleteTarget(null);
      setSelectedCicloIds([]);
      setSelectedDesvioIds([]);
      await load();
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Erro ao excluir registro.");
    } finally {
      setDeleteSaving(false);
    }
  }, [deleteTarget, load, token]);

  useEffect(() => {
    load();
  }, [load]);

  const suspeitos = useMemo(() => ciclos.filter((c) => c.status === "suspeito"), [ciclos]);
  const suspeitosVisiveis = useMemo(
    () => suspeitos.filter((c) => !c.alerta_oculto),
    [suspeitos],
  );

  const ocultarAlertaCiclo = useCallback(
    async (ciclo: MelosaCiclo) => {
      if (!token) return;
      const ok = window.confirm(
        `Ocultar o alerta do ciclo ${ciclo.ciclo_numero} (${ciclo.ativo_melosa_texto})? O ciclo permanece na listagem, mas deixa de aparecer em Alertas.`,
      );
      if (!ok) return;
      setOcultandoAlertaId(ciclo.id);
      try {
        await apiPatch(`/v1/melosa-ciclos/${ciclo.id}`, token, { alerta_oculto: true });
        await load();
      } catch (err: unknown) {
        window.alert(err instanceof Error ? err.message : "Erro ao ocultar alerta");
      } finally {
        setOcultandoAlertaId(null);
      }
    },
    [load, token],
  );

  const ativosUnicos = useMemo(
    () => Array.from(new Set(ciclos.map((c) => c.ativo_melosa_texto))).sort(),
    [ciclos],
  );

  const ciclosParaExportar = useMemo(() => {
    if (selectedCicloIds.length > 0) {
      return ciclos.filter((c) => selectedCicloIds.includes(c.id));
    }
    return ciclos;
  }, [ciclos, selectedCicloIds]);

  const handleExportExcel = useCallback(async () => {
    if (ciclosParaExportar.length === 0) {
      window.alert("Não há ciclos para exportar.");
      return;
    }
    setExporting(true);
    try {
      const cicloRows: DashboardCicloExcelRow[] = ciclosParaExportar.map((c) => ({
        ciclo_numero: c.ciclo_numero,
        ativo_melosa_texto: c.ativo_melosa_texto,
        ciclo_anterior_numero: c.ciclo_anterior_numero,
        data_hora: c.data_hora,
        litros_retirada: c.litros_retirada,
        litros_sobra_anterior: c.litros_sobra_anterior,
        litros_abastecidos: c.litros_abastecidos,
        litros_devolvidos: c.litros_devolvidos,
        litros_sobra_atual: c.litros_sobra_atual,
        capacidade_litros: c.capacidade_litros,
        volume_excedente: c.volume_excedente,
        status: c.status,
      }));
      const desvioRows: DashboardDesvioExcelRow[] = desviosMedidor.map((d) => ({
        data_hora: d.data_hora,
        ativo_melosa_texto: d.ativo_melosa_texto,
        ativo_equipamento_texto: d.ativo_equipamento_texto,
        litros: d.litros,
        quantidade_abastecida: d.melosa_quantidade_abastecida,
        medidor_esperado: d.medidor_final_anterior,
        desvio_litros: d.medidor_desvio_litros,
      }));
      await downloadDashboardCiclosExcel(cicloRows, desvioRows);
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : "Erro ao exportar Excel.");
    } finally {
      setExporting(false);
    }
  }, [ciclosParaExportar, desviosMedidor]);

  const allCiclosSelected = ciclos.length > 0 && ciclos.every((c) => selectedCicloIds.includes(c.id));
  const allDesviosSelected =
    desviosMedidor.length > 0 && desviosMedidor.every((d) => selectedDesvioIds.includes(d.operation_id));

  const toggleCiclo = useCallback((id: string) => {
    setSelectedCicloIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const toggleAllCiclos = useCallback(() => {
    setSelectedCicloIds((prev) => {
      if (ciclos.length === 0) return prev;
      if (ciclos.every((c) => prev.includes(c.id))) return prev.filter((id) => !ciclos.some((c) => c.id === id));
      const merged = new Set(prev);
      ciclos.forEach((c) => merged.add(c.id));
      return Array.from(merged);
    });
  }, [ciclos]);

  const toggleDesvio = useCallback((operationId: string) => {
    setSelectedDesvioIds((prev) =>
      prev.includes(operationId) ? prev.filter((x) => x !== operationId) : [...prev, operationId],
    );
  }, []);

  const toggleAllDesvios = useCallback(() => {
    setSelectedDesvioIds((prev) => {
      if (desviosMedidor.length === 0) return prev;
      if (desviosMedidor.every((d) => prev.includes(d.operation_id))) {
        return prev.filter((id) => !desviosMedidor.some((d) => d.operation_id === id));
      }
      const merged = new Set(prev);
      desviosMedidor.forEach((d) => merged.add(d.operation_id));
      return Array.from(merged);
    });
  }, [desviosMedidor]);

  const temAlertas = suspeitosVisiveis.length > 0 || desviosMedidor.length > 0;

  return (
    <div className="page-shell">
      <EstoqueCombustivelPanel token={token} ativoMelosa={filtroAtivo} />

      <MelosaFluxoPanel token={token} ativosDisponiveis={ativosUnicos} ativoInicial={filtroAtivo} />

      {/* Alertas */}
      <section className={`${glassPanel} p-4 md:p-5`}>
        <SectionHeader
          icon={AlertTriangle}
          title="Alertas"
          description={
            temAlertas
              ? "Registros que precisam de revisão."
              : "Nenhuma irregularidade nos dados listados."
          }
        />

        {!temAlertas ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-300/50 bg-emerald-50/50 px-4 py-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm text-slate-700 dark:text-slate-300">Tudo dentro do esperado no filtro atual.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {suspeitosVisiveis.length > 0 ? (
              <div>
                <h3 className="mb-2 text-sm font-bold text-red-800 dark:text-red-300">
                  Capacidade ultrapassada ({suspeitosVisiveis.length})
                </h3>
                <div className="table-scroll rounded-xl border border-red-200/60 dark:border-red-900/40">
                  <table className="w-full min-w-[720px] border-collapse text-sm">
                    <thead>
                      <tr className="bg-red-50/80 text-left text-xs font-bold uppercase text-red-900 dark:bg-red-950/40 dark:text-red-200">
                        <th className="px-3 py-2">ID</th>
                        <th className="px-3 py-2">Melosa</th>
                        <th className="px-3 py-2">Excedente (L)</th>
                        <th className="px-3 py-2">Sobra ant. + Enchimento</th>
                        <th className="px-3 py-2">Capacidade (L)</th>
                        <th className="px-3 py-2">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {suspeitosVisiveis.map((c) => (
                        <tr key={c.id} className="border-t border-red-100 dark:border-red-900/30">
                          <td className="px-3 py-2 font-bold">{c.ciclo_numero}</td>
                          <td className="px-3 py-2">{c.ativo_melosa_texto}</td>
                          <td className="px-3 py-2 font-semibold text-red-700 dark:text-red-400">
                            {fmtLitrosDashboard(c.volume_excedente)}
                          </td>
                          <td className="px-3 py-2">
                            {fmtLitrosDashboard(c.litros_sobra_anterior)} +{" "}
                            {fmtLitrosDashboard(c.litros_retirada)}
                          </td>
                          <td className="px-3 py-2">
                            {c.capacidade_litros != null ? fmtLitrosDashboard(c.capacidade_litros) : "—"}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setAlertaEditCiclo({
                                    id: c.id,
                                    ciclo_numero: c.ciclo_numero,
                                    ativo_melosa_texto: c.ativo_melosa_texto,
                                    capacidade_litros: c.capacidade_litros,
                                    volume_excedente: c.volume_excedente,
                                    litros_sobra_anterior: c.litros_sobra_anterior,
                                    litros_retirada: c.litros_retirada,
                                  })
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white/80 px-2 py-1 text-xs font-semibold text-slate-800 transition hover:bg-slate-100 dark:border-white/20 dark:bg-black/20 dark:text-slate-100"
                              >
                                <Pencil className="h-3 w-3" />
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => void ocultarAlertaCiclo(c)}
                                disabled={ocultandoAlertaId === c.id}
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-400/80 bg-amber-50/80 px-2 py-1 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200"
                              >
                                <EyeOff className="h-3 w-3" />
                                {ocultandoAlertaId === c.id ? "Ocultando…" : "Retirar"}
                              </button>
                              {isAdmin ? (
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget({ kind: "ciclos", ids: [c.id] })}
                                  className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white transition hover:bg-red-700"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  Excluir
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {desviosMedidor.length > 0 ? (
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-amber-800 dark:text-amber-300">
                    Medidor acumulado ({desviosMedidor.length})
                  </h3>
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget({ kind: "desvios", operationIds: selectedDesvioIds })}
                      disabled={selectedDesvioIds.length === 0}
                      className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Excluir ({selectedDesvioIds.length})
                    </button>
                  ) : null}
                </div>
                <div className="table-scroll rounded-xl border border-amber-200/60 dark:border-amber-900/40">
                  <table className="w-full min-w-[720px] border-collapse text-sm">
                    <thead>
                      <tr className="bg-amber-50/80 text-left text-xs font-bold uppercase text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                        {isAdmin ? (
                          <th className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={allDesviosSelected}
                              onChange={toggleAllDesvios}
                              aria-label="Selecionar todos os alertas de medidor"
                            />
                          </th>
                        ) : null}
                        <th className="px-3 py-2">Data/hora</th>
                        <th className="px-3 py-2">Melosa</th>
                        <th className="px-3 py-2">Equipamento</th>
                        <th className="px-3 py-2">Inicial</th>
                        <th className="px-3 py-2">Esperado</th>
                        <th className="px-3 py-2">Desvio (L)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {desviosMedidor.map((d) => {
                        const desvio = d.medidor_desvio_litros ?? 0;
                        return (
                          <tr
                            key={d.operation_id}
                            className="border-t border-amber-100 dark:border-amber-900/30"
                          >
                            {isAdmin ? (
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={selectedDesvioIds.includes(d.operation_id)}
                                  onChange={() => toggleDesvio(d.operation_id)}
                                />
                              </td>
                            ) : null}
                            <td className="px-3 py-2 whitespace-nowrap">{fmtDataBr(d.data_hora)}</td>
                            <td className="px-3 py-2">{d.ativo_melosa_texto}</td>
                            <td className="px-3 py-2">{d.ativo_equipamento_texto ?? "—"}</td>
                            <td className="px-3 py-2">{d.melosa_quantidade_abastecida ?? "—"}</td>
                            <td className="px-3 py-2">{d.medidor_final_anterior ?? "—"}</td>
                            <td className="px-3 py-2 font-semibold text-amber-800 dark:text-amber-300">
                              {desvio > 0 ? "+" : ""}
                              {fmtLitrosDashboard(desvio)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {/* Tabela principal — Ciclos */}
      <section className={`${glassPanel} p-4 md:p-5`}>
        <SectionHeader
          icon={LayoutDashboard}
          title="Ciclos de enchimento"
          description="Retiradas do tanque que abriram ciclo na melosa."
        />

        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <label className="filter-field-md">
              <span className={labelCls}>Filtrar melosa</span>
              <input
                className={glassField}
                placeholder="Ex.: CCL1999"
                value={filtroAtivo}
                onChange={(e) => setFiltroAtivo(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={apenasSuspeitos}
                onChange={(e) => setApenasSuspeitos(e.target.checked)}
              />
              Somente suspeitos
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-60 dark:border-white/20 dark:bg-black/20 dark:text-slate-100"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Atualizando…" : "Atualizar"}
            </button>
            <button
              type="button"
              onClick={() => void handleExportExcel()}
              disabled={exporting || ciclos.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {exporting ? "Exportando…" : "Exportar Excel"}
            </button>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setDeleteTarget({ kind: "ciclos", ids: selectedCicloIds })}
                disabled={selectedCicloIds.length === 0 || loading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Excluir ({selectedCicloIds.length})
              </button>
            ) : null}
          </div>
        </div>

        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          {ciclos.length} {ciclos.length === 1 ? "ciclo" : "ciclos"}
          {selectedCicloIds.length > 0
            ? ` · ${selectedCicloIds.length} selecionado${selectedCicloIds.length === 1 ? "" : "s"} (exportação usa seleção)`
            : " · exportação inclui todos visíveis"}
        </p>

        {error ? (
          <p className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {error}
            {error.includes("melosa_ciclos") || error.includes("does not exist") ? (
              <span className="mt-1 block">
                Execute a migration <code className="text-xs">migration_melosa_ciclos.sql</code> no Supabase.
              </span>
            ) : null}
          </p>
        ) : null}

        <div className="table-scroll rounded-xl border border-white/30 dark:border-white/10" style={{ maxHeight: "min(32rem, 60vh)" }}>
          <table className="w-max min-w-full border-collapse text-sm">
            <thead>
              <tr>
                {isAdmin ? (
                  <th className={thCls}>
                    <input
                      type="checkbox"
                      checked={allCiclosSelected}
                      onChange={toggleAllCiclos}
                      disabled={ciclos.length === 0}
                      aria-label="Selecionar todos os ciclos"
                    />
                  </th>
                ) : null}
                <th className={thCls}>ID</th>
                <th className={thCls}>Melosa</th>
                <th className={thCls}>ID anterior</th>
                <th className={thCls}>Data/hora</th>
                <th className={thCls}>Enchimento (L)</th>
                <th className={thCls}>Sobra ant. (L)</th>
                <th className={thCls}>Abastecido (L)</th>
                <th className={thCls}>Sobra atual (L)</th>
                <th className={thCls}>Capacidade (L)</th>
                <th className={thCls}>Excedente (L)</th>
                <th className={thCls}>Status</th>
              </tr>
            </thead>
            <tbody>
              {ciclos.map((c, idx) => {
                const zebra = idx % 2 === 0 ? "bg-transparent" : "bg-white/30 dark:bg-white/[0.04]";
                const selected = selectedCicloIds.includes(c.id);
                return (
                  <tr key={c.id} className={`${zebra} ${selected ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}`}>
                    {isAdmin ? (
                      <td className={tdCls}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleCiclo(c.id)}
                          aria-label={`Selecionar ciclo ID ${c.ciclo_numero}`}
                        />
                      </td>
                    ) : null}
                    <td className={`${tdCls} font-bold`}>{c.ciclo_numero}</td>
                    <td className={tdCls}>{c.ativo_melosa_texto}</td>
                    <td className={tdCls}>{c.ciclo_anterior_numero ?? "—"}</td>
                    <td className={`${tdCls} whitespace-nowrap`}>{fmtDataBr(c.data_hora)}</td>
                    <td className={tdCls}>{fmtLitrosDashboard(c.litros_retirada)}</td>
                    <td className={tdCls}>{fmtLitrosDashboard(c.litros_sobra_anterior)}</td>
                    <td className={tdCls}>{fmtLitrosDashboard(c.litros_abastecidos)}</td>
                    <td className={tdCls}>{fmtLitrosDashboard(c.litros_sobra_atual)}</td>
                    <td className={tdCls}>
                      {c.capacidade_litros != null ? fmtLitrosDashboard(c.capacidade_litros) : "—"}
                    </td>
                    <td
                      className={`${tdCls} ${c.volume_excedente > 0 ? "font-semibold text-red-700 dark:text-red-400" : ""}`}
                    >
                      {c.volume_excedente > 0 ? fmtLitrosDashboard(c.volume_excedente) : "—"}
                    </td>
                    <td className={tdCls}>
                      <StatusBadge status={c.status} />
                    </td>
                  </tr>
                );
              })}
              {ciclos.length === 0 && !loading ? (
                <tr>
                  <td colSpan={isAdmin ? 12 : 11} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                    Nenhum ciclo registrado. As retiradas do tanque passam a gerar ID automaticamente.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* Atalhos */}
      <section>
        <p className={`${labelCls} mb-3`}>Atalhos</p>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {canAccessPage("bi_tanque") ? (
            <DashboardCard
              to="/bi"
              title="BI Tanque"
              description="Retiradas e entradas no tanque."
              icon={TrendingDown}
            />
          ) : null}
          {canAccessPage("bi_melosa") ? (
            <DashboardCard
              to="/bi/melosa"
              title="BI abastecimentos"
              description="Abastecimentos de equipamentos."
              icon={Droplets}
            />
          ) : null}
          {canAccessPage("consumo_medio") ? (
            <DashboardCard
              to="/consumo-medio"
              title="Consumo médio"
              description="Média de litros por hora ou km entre leituras do horímetro."
              icon={Gauge}
            />
          ) : null}
          {canAccessPage("melosas") ? (
            <DashboardCard
              to="/melosas"
              title="Melosas"
              description="Cadastro de melosas e capacidade em litros."
              icon={Fuel}
            />
          ) : null}
          {canAccessPage("equipamentos") ? (
            <DashboardCard
              to="/equipamentos"
              title="Equipamentos"
              description="Máquinas e veículos abastecidos."
              icon={HardHat}
            />
          ) : null}
          {canAccessPage("contratos") ? (
            <DashboardCard
              to="/contratos"
              title="Contratos"
              description="Contratos e empresas."
              icon={HardHat}
            />
          ) : null}
        </div>
      </section>

      <DashboardResumoSection
        ciclosCount={ciclos.length}
        suspeitosCount={suspeitosVisiveis.length}
        desviosCount={desviosMedidor.length}
        melosasCount={ativosUnicos.length}
        ultimoCicloNumero={ciclos[0] ? String(ciclos[0].ciclo_numero) : "—"}
        ultimaMelosa={ciclos[0]?.ativo_melosa_texto}
      />

      {alertaEditCiclo ? (
        <DashboardAlertaCicloModal
          open={Boolean(alertaEditCiclo)}
          ciclo={alertaEditCiclo}
          token={token ?? ""}
          onClose={() => setAlertaEditCiclo(null)}
          onSaved={() => void load()}
        />
      ) : null}

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dashboard-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDeleteModal();
          }}
        >
          <div className={`max-w-md rounded-2xl p-6 shadow-xl ${glassPanel}`}>
            <h2 id="delete-dashboard-title" className="text-lg font-bold text-slate-900 dark:text-white">
              Confirmar exclusão
            </h2>
            {deleteTarget.kind === "ciclos" ? (
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                Excluir <strong>{deleteTarget.ids.length}</strong> ciclo
                {deleteTarget.ids.length === 1 ? "" : "s"}? Remove a retirada do tanque vinculada e reencadeia o ID
                anterior dos ciclos seguintes.
              </p>
            ) : deleteTarget.kind === "desvios" ? (
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                Excluir <strong>{deleteTarget.operationIds.length}</strong> abastecimento
                {deleteTarget.operationIds.length === 1 ? "" : "s"} selecionado
                {deleteTarget.operationIds.length === 1 ? "" : "s"}?
              </p>
            ) : (
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                Excluir abastecimento de <strong>{deleteTarget.desvio.ativo_equipamento_texto ?? "—"}</strong>?
              </p>
            )}
            {deleteError ? (
              <p className="mt-3 text-sm font-semibold text-red-700 dark:text-red-300">{deleteError}</p>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={deleteSaving}
                className="rounded-lg border border-slate-300 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 disabled:opacity-50 dark:border-white/20 dark:bg-black/20 dark:text-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void executeDelete()}
                disabled={deleteSaving}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {deleteSaving ? "Excluindo…" : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
