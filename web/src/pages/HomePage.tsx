import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  ClipboardList,
  Droplets,
  FileText,
  Fuel,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import DashboardCard from "../components/dashboard/DashboardCard";
import MelosaAtivoResumoModal from "../components/dashboard/MelosaAtivoResumoModal";
import { useAuth } from "../state/AuthContext";
import { apiGet } from "../lib/api";
import {
  aggregateCombustivelDashboard,
  aggregateMelosaPorAtivo,
  aggregateTanquePrincipal,
  defaultPeriodoMesAtual,
  listDashboardAtivosMelosa,
  listDashboardTanques,
  listDashboardUsuarios,
  parseDateInputValue,
  resolveDevolvidoTanque,
  toDateInputValue,
  type MovimentoMelosaRow,
  type MovimentoTanqueRow,
} from "../lib/aggregateCombustivelDashboard";
import {
  calcularCombustivelControle,
  fmtLitrosDashboard,
  fmtPctDashboard,
} from "../lib/combustivelControle";
import { glassField, glassPanel } from "../lib/glass";
import { buildResumoAtivoMelosa } from "../lib/melosaAtivoResumo";

type ObraRow = { codigo: number; nome: string };

const PAGE_SIZE = 500;
const LIMITE_PADRAO_PCT = 3.5;

const labelCls =
  "text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400";

function MetricCard({
  title,
  value,
  hint,
  tone = "neutral",
}: {
  title: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "in" | "out" | "warn" | "ok";
}) {
  const toneCls =
    tone === "in"
      ? "border-emerald-300/60 bg-emerald-50/80 dark:border-emerald-800/50 dark:bg-emerald-950/30"
      : tone === "out"
        ? "border-amber-300/60 bg-amber-50/80 dark:border-amber-800/50 dark:bg-amber-950/30"
        : tone === "warn"
          ? "border-red-300/70 bg-red-50/85 dark:border-red-900/50 dark:bg-red-950/35"
          : tone === "ok"
            ? "border-sky-300/60 bg-sky-50/80 dark:border-sky-800/50 dark:bg-sky-950/30"
            : "border-white/40 bg-white/40 dark:border-white/10 dark:bg-white/[0.04]";

  return (
    <div className={`rounded-xl border px-4 py-3 ${toneCls}`}>
      <p className={`${labelCls} mb-1`}>{title}</p>
      <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{hint}</p> : null}
    </div>
  );
}

function MelosaDevolvidoSobraCard({
  devolvidoLitros,
  sobraLitros,
  devolvidoHint,
  recebido,
  abastecido,
}: {
  devolvidoLitros: number;
  sobraLitros: number;
  devolvidoHint: string;
  recebido: number;
  abastecido: number;
}) {
  const sobraTone =
    sobraLitros > 0
      ? "border-amber-300/60 bg-amber-50/80 dark:border-amber-800/50 dark:bg-amber-950/30"
      : "border-sky-300/60 bg-sky-50/80 dark:border-sky-800/50 dark:bg-sky-950/30";

  return (
    <div className={`rounded-xl border px-4 py-4 sm:col-span-2 ${sobraTone}`}>
      <p className={`${labelCls} mb-3`}>Devolvido ao tanque e saldo na melosa</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-white/50 bg-white/50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
          <p className={`${labelCls} mb-1 text-emerald-700 dark:text-emerald-400`}>Devolvido ao tanque</p>
          <p className="text-2xl font-bold tabular-nums text-emerald-800 dark:text-emerald-300">
            {fmtLitrosDashboard(devolvidoLitros)} L
          </p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{devolvidoHint}</p>
        </div>
        <div className="rounded-lg border border-white/50 bg-white/50 px-4 py-3 dark:border-white/10 dark:bg-black/20">
          <p className={`${labelCls} mb-1`}>Sobra na melosa</p>
          <p
            className={`text-2xl font-bold tabular-nums ${
              sobraLitros > 0 ? "text-amber-800 dark:text-amber-300" : "text-slate-900 dark:text-white"
            }`}
          >
            {fmtLitrosDashboard(sobraLitros)} L
          </p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Recebido ({fmtLitrosDashboard(recebido)} L) − Abastec. ({fmtLitrosDashboard(abastecido)} L) −
            Devolvido
          </p>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { user, isAdmin, token } = useAuth();
  const email = user?.email ?? "";
  const shortName = email ? email.split("@")[0] : "";
  const greeting = isAdmin ? "Administrador" : shortName || "Utilizador";

  const periodoInicial = defaultPeriodoMesAtual();
  const [tanqueRows, setTanqueRows] = useState<MovimentoTanqueRow[]>([]);
  const [melosaRows, setMelosaRows] = useState<MovimentoMelosaRow[]>([]);
  const [obras, setObras] = useState<ObraRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dataDe, setDataDe] = useState(toDateInputValue(periodoInicial.de));
  const [dataAte, setDataAte] = useState(toDateInputValue(periodoInicial.ate));
  const [obraFiltro, setObraFiltro] = useState<string>("");
  const [usuarioFiltro, setUsuarioFiltro] = useState<string>("");
  const [ativoMelosaFiltro, setAtivoMelosaFiltro] = useState<string>("");
  const [tanquePrincipalFiltro, setTanquePrincipalFiltro] = useState<string>("");
  const [devolvidoManual, setDevolvidoManual] = useState("");
  const [limitePct, setLimitePct] = useState(String(LIMITE_PADRAO_PCT));
  const [resumoAtivoOpen, setResumoAtivoOpen] = useState(false);

  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const fetchPaged = async (origem: "tanque" | "melosa") => {
        const rows: Record<string, unknown>[] = [];
        let offset = 0;
        for (let i = 0; i < 200; i += 1) {
          const res = await fetch(
            `${import.meta.env.VITE_API_URL}/v1/movimentacoes?limit=${PAGE_SIZE}&offset=${offset}&origem=${origem}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`);
          }
          const chunk = (json?.movimentacoes ?? []) as Record<string, unknown>[];
          rows.push(...chunk);
          if (chunk.length < PAGE_SIZE) break;
          offset += PAGE_SIZE;
        }
        return rows;
      };

      const [tanque, melosa, obrasJson] = await Promise.all([
        fetchPaged("tanque"),
        fetchPaged("melosa"),
        apiGet<{ obras: ObraRow[] }>("/v1/obras", token),
      ]);

      setTanqueRows(tanque as MovimentoTanqueRow[]);
      setMelosaRows(melosa as MovimentoMelosaRow[]);
      setObras(obrasJson?.obras ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const filtros = useMemo(
    () => ({
      de: parseDateInputValue(dataDe),
      ate: parseDateInputValue(dataAte),
      obraCodigo: obraFiltro ? Number(obraFiltro) : null,
      usuarioId: usuarioFiltro || null,
    }),
    [dataAte, dataDe, obraFiltro, usuarioFiltro],
  );

  const usuariosOpcoes = useMemo(
    () => listDashboardUsuarios(tanqueRows, melosaRows),
    [tanqueRows, melosaRows],
  );

  const ativosMelosaOpcoes = useMemo(
    () => listDashboardAtivosMelosa(tanqueRows, melosaRows),
    [tanqueRows, melosaRows],
  );

  const resumoMelosaAtivo = useMemo(() => {
    if (!ativoMelosaFiltro) return null;
    return aggregateMelosaPorAtivo(tanqueRows, melosaRows, filtros, ativoMelosaFiltro);
  }, [ativoMelosaFiltro, tanqueRows, melosaRows, filtros]);

  const devolvidoResumoMelosaAtivo = useMemo(() => {
    if (!resumoMelosaAtivo) return null;
    return resolveDevolvidoTanque(
      resumoMelosaAtivo.devolvidoMelosaAutomatico,
      devolvidoManual,
      resumoMelosaAtivo.qtdDevolucoesMelosa,
    );
  }, [resumoMelosaAtivo, devolvidoManual]);

  const tanquesOpcoes = useMemo(() => listDashboardTanques(tanqueRows), [tanqueRows]);

  const tanqueNumeroFiltro = useMemo((): 1 | 2 | null => {
    if (tanquePrincipalFiltro === "1") return 1;
    if (tanquePrincipalFiltro === "2") return 2;
    return null;
  }, [tanquePrincipalFiltro]);

  const agregadoTanque = useMemo(
    () => aggregateTanquePrincipal(tanqueRows, filtros, tanqueNumeroFiltro),
    [tanqueRows, filtros, tanqueNumeroFiltro],
  );

  const agregadoTanqueGlobal = useMemo(
    () => aggregateTanquePrincipal(tanqueRows, filtros, null),
    [tanqueRows, filtros],
  );

  const agregado = useMemo(
    () => aggregateCombustivelDashboard(tanqueRows, melosaRows, filtros),
    [tanqueRows, melosaRows, filtros],
  );

  const devolvidoResumoGlobal = useMemo(
    () =>
      resolveDevolvidoTanque(
        agregadoTanqueGlobal.devolvidoMelosaAutomatico,
        devolvidoManual,
        agregadoTanqueGlobal.qtdDevolucoesMelosa,
      ),
    [agregadoTanqueGlobal, devolvidoManual],
  );

  const devolvidoResumoTanque = useMemo(
    () =>
      resolveDevolvidoTanque(
        agregadoTanque.devolvidoMelosaAutomatico,
        devolvidoManual,
        agregadoTanque.qtdDevolucoesMelosa,
      ),
    [agregadoTanque, devolvidoManual],
  );

  const limiteAceitavelPct = useMemo(() => {
    const n = Number(limitePct.replace(",", ".").trim());
    return Number.isFinite(n) && n >= 0 ? n : LIMITE_PADRAO_PCT;
  }, [limitePct]);

  const fechamentoInputs = useMemo(() => {
    if (!resumoMelosaAtivo || !devolvidoResumoMelosaAtivo) return null;
    return {
      entradaTanque: agregado.entradaTanque,
      retiradaMelosa: resumoMelosaAtivo.recebidoDoTanque,
      abastecimentosEquipamentos: resumoMelosaAtivo.abastecimentosEquipamentos,
      devolvidoTanque: devolvidoResumoMelosaAtivo.total,
      limiteAceitavelPct,
    };
  }, [agregado.entradaTanque, devolvidoResumoMelosaAtivo, limiteAceitavelPct, resumoMelosaAtivo]);

  const fechamento = useMemo(() => {
    if (!fechamentoInputs) return null;
    return calcularCombustivelControle(fechamentoInputs);
  }, [fechamentoInputs]);

  const melosaAtivoPronto = Boolean(ativoMelosaFiltro && resumoMelosaAtivo && devolvidoResumoMelosaAtivo && fechamento);

  const sobraMelosaAtivo =
    resumoMelosaAtivo && devolvidoResumoMelosaAtivo
      ? resumoMelosaAtivo.recebidoDoTanque -
        resumoMelosaAtivo.abastecimentosEquipamentos -
        devolvidoResumoMelosaAtivo.total
      : 0;

  const resumoAtivoPayload = useMemo(() => {
    if (!ativoMelosaFiltro || !resumoMelosaAtivo) return null;
    const devolvidoAtivo = resolveDevolvidoTanque(
      resumoMelosaAtivo.devolvidoMelosaAutomatico,
      devolvidoManual,
      resumoMelosaAtivo.qtdDevolucoesMelosa,
    );
    return buildResumoAtivoMelosa(
      tanqueRows,
      melosaRows,
      filtros,
      ativoMelosaFiltro,
      obras,
      devolvidoAtivo.total,
      limiteAceitavelPct,
    );
  }, [
    ativoMelosaFiltro,
    devolvidoManual,
    filtros,
    limiteAceitavelPct,
    melosaRows,
    obras,
    resumoMelosaAtivo,
    tanqueRows,
  ]);

  const devolvidoMelosaHint =
    devolvidoResumoMelosaAtivo?.usaManual
      ? `Ajuste manual (automático: ${fmtLitrosDashboard(devolvidoResumoMelosaAtivo.automatico)} L)`
      : devolvidoResumoMelosaAtivo && devolvidoResumoMelosaAtivo.qtdDevolucoes > 0
        ? `${devolvidoResumoMelosaAtivo.qtdDevolucoes} entrada(s) no tanque com placa ${ativoMelosaFiltro}`
        : `Entrada no tanque com placa ${ativoMelosaFiltro}`;

  const saldoTanquePrincipal =
    agregadoTanque.entradaTanque -
    agregadoTanque.retiradaMelosa +
    devolvidoResumoTanque.total;
  const saidaLiquidaTanque = agregadoTanque.retiradaMelosa - devolvidoResumoTanque.total;

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white md:text-3xl">
            Dashboard — {greeting}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            Controle de entrada e saída do tanque principal e da melosa. Os volumes vêm dos registos do app
            (medidor do tanque nas retiradas; medidor acumulado da melosa nos abastecimentos).
          </p>
        </div>
        <img
          src="/dimensional-logo.png"
          alt="Dimensional Engenharia"
          className="h-20 w-auto object-contain"
        />
      </header>

      <div className={`mb-5 flex flex-wrap items-end gap-4 p-4 ${glassPanel}`}>
        <div className="flex flex-col gap-1">
          <span className={labelCls}>De</span>
          <input type="date" className={glassField} value={dataDe} onChange={(e) => setDataDe(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <span className={labelCls}>Até</span>
          <input type="date" className={glassField} value={dataAte} onChange={(e) => setDataAte(e.target.value)} />
        </div>
        <div className="flex min-w-[180px] flex-col gap-1">
          <span className={labelCls}>Obra</span>
          <select className={glassField} value={obraFiltro} onChange={(e) => setObraFiltro(e.target.value)}>
            <option value="">Todas</option>
            {obras.map((o) => (
              <option key={o.codigo} value={String(o.codigo)}>
                {o.codigo} — {o.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-[200px] flex-col gap-1">
          <span className={labelCls}>Utilizador</span>
          <select
            className={glassField}
            value={usuarioFiltro}
            onChange={(e) => setUsuarioFiltro(e.target.value)}
          >
            <option value="">Todos</option>
            {usuariosOpcoes.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-[160px] flex-col gap-1">
          <span className={labelCls}>Ajuste devolvido (L)</span>
          <input
            type="text"
            inputMode="decimal"
            className={glassField}
            placeholder={
              devolvidoResumoGlobal.automatico > 0
                ? String(devolvidoResumoGlobal.automatico)
                : "Automático"
            }
            value={devolvidoManual}
            onChange={(e) => setDevolvidoManual(e.target.value)}
            title="Deixe vazio para usar o automático: entradas no tanque com a mesma placa/ativo da retirada melosa"
          />
        </div>
        <div className="flex w-28 flex-col gap-1">
          <span className={labelCls}>Limite %</span>
          <input
            type="text"
            inputMode="decimal"
            className={glassField}
            value={limitePct}
            onChange={(e) => setLimitePct(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => loadAll()}
          disabled={loading}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition hover:bg-accent-hover disabled:opacity-50"
        >
          {loading ? "A carregar…" : "Atualizar"}
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-300/80 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className={`p-5 ${glassPanel}`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Fuel className="h-5 w-5 text-emerald-600" aria-hidden />
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Tanque principal</h2>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="filtro-tanque-principal" className={`${labelCls} sr-only`}>
                Tanque
              </label>
              <select
                id="filtro-tanque-principal"
                className={`${glassField} min-w-[140px] py-1.5 text-sm`}
                value={tanquePrincipalFiltro}
                onChange={(e) => setTanquePrincipalFiltro(e.target.value)}
                title="Filtrar entradas e saídas por tanque 1 ou 2"
              >
                <option value="">Todos os tanques</option>
                {tanquesOpcoes.map((n) => (
                  <option key={n} value={String(n)}>
                    Tanque {n}
                  </option>
                ))}
                {tanquesOpcoes.length === 0 ? (
                  <>
                    <option value="1">Tanque 1</option>
                    <option value="2">Tanque 2</option>
                  </>
                ) : null}
              </select>
            </div>
          </div>
          {tanqueNumeroFiltro != null ? (
            <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">
              A mostrar apenas movimentações do <strong>Tanque {tanqueNumeroFiltro}</strong> (campo{" "}
              <code className="rounded bg-black/5 px-1 dark:bg-black/20">tanque_numero</code>).
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard
              title="Entrada no tanque"
              value={`${fmtLitrosDashboard(agregadoTanque.entradaTanque)} L`}
              hint={`${agregadoTanque.qtdEntradas} entrada(s) de combustível (exclui devolução melosa)`}
              tone="in"
            />
            <MetricCard
              title="Saída p/ melosa"
              value={`${fmtLitrosDashboard(agregadoTanque.retiradaMelosa)} L`}
              hint={`${agregadoTanque.qtdRetiradasTanque} retirada(s) — medidor final − inicial`}
              tone="out"
            />
            <MetricCard
              title="Devolvido pela melosa"
              value={`${fmtLitrosDashboard(devolvidoResumoTanque.total)} L`}
              hint={
                devolvidoResumoTanque.usaManual
                  ? `Ajuste manual (auto: ${fmtLitrosDashboard(devolvidoResumoTanque.automatico)} L)`
                  : devolvidoResumoTanque.qtdDevolucoes > 0
                    ? `${devolvidoResumoTanque.qtdDevolucoes} entrada(s) com placa da retirada melosa`
                    : "Mesma placa/ativo da retirada do tanque na entrada"
              }
              tone="in"
            />
            <MetricCard
              title="Saldo no tanque"
              value={`${fmtLitrosDashboard(saldoTanquePrincipal)} L`}
              hint="(Entrada − Saída melosa) + Devolvido"
              tone="ok"
            />
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Saída líquida do tanque no período: <strong>{fmtLitrosDashboard(saidaLiquidaTanque)} L</strong>
          </p>
        </section>

        <section className={`p-5 ${glassPanel}`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Droplets className="h-5 w-5 text-sky-600" aria-hidden />
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Melosa (caminhão)</h2>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="filtro-ativo-melosa" className={`${labelCls} sr-only`}>
                Ativo / placa
              </label>
              <select
                id="filtro-ativo-melosa"
                className={`${glassField} min-w-[160px] py-1.5 text-sm`}
                value={ativoMelosaFiltro}
                onChange={(e) => {
                  setAtivoMelosaFiltro(e.target.value);
                  setResumoAtivoOpen(false);
                }}
                title="Selecione o ativo/placa da melosa para ver os dados"
              >
                <option value="">Selecione ativo/placa</option>
                {ativosMelosaOpcoes.map((placa) => (
                  <option key={placa} value={placa}>
                    {placa}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!ativoMelosaFiltro ? (
            <p className="rounded-xl border border-dashed border-slate-300/80 bg-slate-50/80 px-4 py-10 text-center text-sm text-slate-600 dark:border-white/15 dark:bg-white/[0.03] dark:text-slate-400">
              Selecione o <strong>ativo/placa</strong> da melosa para ver recebimento, abastecimentos,
              devolução ao tanque, sobra e fechamento.
            </p>
          ) : resumoMelosaAtivo && devolvidoResumoMelosaAtivo ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard
                title="Recebido do tanque"
                value={`${fmtLitrosDashboard(resumoMelosaAtivo.recebidoDoTanque)} L`}
                hint={`${resumoMelosaAtivo.qtdRetiradasTanque} retirada(s) do tanque — placa ${ativoMelosaFiltro}`}
                tone="in"
              />
              <MetricCard
                title="Abastec. equipamentos"
                value={`${fmtLitrosDashboard(resumoMelosaAtivo.abastecimentosEquipamentos)} L`}
                hint={`${resumoMelosaAtivo.qtdAbastecimentosMelosa} retirada(s) melosa — medidor acumulado`}
                tone="out"
              />
              <MelosaDevolvidoSobraCard
                devolvidoLitros={devolvidoResumoMelosaAtivo.total}
                sobraLitros={sobraMelosaAtivo}
                devolvidoHint={devolvidoMelosaHint}
                recebido={resumoMelosaAtivo.recebidoDoTanque}
                abastecido={resumoMelosaAtivo.abastecimentosEquipamentos}
              />
            </div>
          ) : null}
        </section>
      </div>

      {melosaAtivoPronto && fechamento && fechamentoInputs ? (
      <section
        className={`mb-6 p-5 ${glassPanel} ${
          fechamento.status === "suspeita"
            ? "ring-2 ring-red-400/50 dark:ring-red-600/40"
            : fechamento.status === "ok"
              ? "ring-1 ring-emerald-400/30"
              : ""
        }`}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-slate-700 dark:text-slate-300" aria-hidden />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Fechamento caminhão-melosa</h2>
            <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-black/20 dark:text-slate-300">
              Ativo {ativoMelosaFiltro}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {fechamento.status === "suspeita" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-3 py-1 text-xs font-bold uppercase text-white">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                Suspeita de desvio
              </span>
            ) : fechamento.status === "ok" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold uppercase text-white">
                <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                Dentro do aceitável
              </span>
            ) : (
              <span className="rounded-full bg-slate-500 px-3 py-1 text-xs font-bold uppercase text-white">
                Sem retirada no período
              </span>
            )}
            <button
              type="button"
              onClick={() => setResumoAtivoOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-sm font-semibold text-white shadow-md shadow-accent/20 transition hover:bg-accent-hover"
              title="Abrir resumo detalhado: retiradas, abastecimentos, devoluções e análise por evento"
            >
              <ClipboardList className="h-4 w-4" aria-hidden />
              Gerar resumo
            </button>
          </div>
        </div>

        <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
          Compara o que saiu do tanque para a melosa ({ativoMelosaFiltro}) com o que foi justificado
          (abastecimentos + devolução). Acima de {limiteAceitavelPct}% pode indicar desvio; a margem cobre{" "}
          <strong>deslocamento do caminhão</strong> e <strong>fundo de tanque</strong> (volume mínimo no medidor).
        </p>

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <MetricCard
            title="Retirada melosa (entrada)"
            value={`${fmtLitrosDashboard(fechamentoInputs.retiradaMelosa)} L`}
            hint="Volume que saiu do tanque para a(s) melosa(s)"
            tone="out"
          />
          <MetricCard
            title="Abastecimentos"
            value={`${fmtLitrosDashboard(fechamentoInputs.abastecimentosEquipamentos)} L`}
            hint="Soma das retiradas melosa (equipamentos)"
            tone="neutral"
          />
          <MetricCard
            title="Devolvido ao tanque"
            value={`${fmtLitrosDashboard(fechamentoInputs.devolvidoTanque)} L`}
            hint="Entradas no tanque com placa de retirada"
            tone="in"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Volume justificado"
            value={`${fmtLitrosDashboard(fechamento.volumeJustificado)} L`}
            hint="Abastecimentos + Devolvido"
          />
          <MetricCard
            title="Diferença total"
            value={`${fmtLitrosDashboard(fechamento.diferencaLitros)} L`}
            hint={fmtPctDashboard(fechamento.diferencaPct)}
            tone={fechamento.diferencaLitros > fechamento.margemOperacionalLitros ? "warn" : "neutral"}
          />
          <MetricCard
            title="Margem operacional"
            value={`${fmtLitrosDashboard(fechamento.margemOperacionalLitros)} L`}
            hint={`Até ${limiteAceitavelPct}% da retirada`}
          />
          <MetricCard
            title="Volume suspeito"
            value={`${fmtLitrosDashboard(fechamento.volumeSuspeito)} L`}
            hint={
              fechamento.status === "suspeita"
                ? "Acima da margem aceitável"
                : "—"
            }
            tone={fechamento.volumeSuspeito > 0 ? "warn" : "ok"}
          />
        </div>

        <details className="mt-4 text-sm text-slate-600 dark:text-slate-400">
          <summary className="cursor-pointer font-semibold text-slate-800 dark:text-slate-200">
            Como os números são calculados
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Retirada melosa</strong> = soma das retiradas de tanque (medidor tanque final − inicial).
            </li>
            <li>
              <strong>Abastecimentos</strong> = soma das retiradas melosa (medidor acumulado ini − fin).
            </li>
            <li>
              <strong>Devolvido</strong> = entradas no tanque da obra com a mesma placa/ativo usada numa
              retirada do tanque (melosa a devolver). Pode ajustar manualmente no filtro.
            </li>
            <li>
              <strong>Entrada no tanque</strong> = demais entradas (combustível novo), sem essa placa de
              retirada.
            </li>
            <li>Volume justificado = Abastecimentos + Devolvido.</li>
            <li>Diferença = Retirada melosa − Volume justificado.</li>
          </ul>
        </details>
      </section>
      ) : null}

      {resumoAtivoOpen && resumoAtivoPayload ? (
        <MelosaAtivoResumoModal
          resumo={resumoAtivoPayload}
          limitePct={limiteAceitavelPct}
          onClose={() => setResumoAtivoOpen(false)}
        />
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <DashboardCard
          to="/bi"
          title="BI Tanque"
          description="Movimentações, mapa, exportação Descarbonize e tickets."
          icon={TrendingDown}
        />
        <DashboardCard
          to="/bi/melosa"
          title="BI Melosa"
          description="Retiradas melosa, fotos, lacre e Excel."
          icon={Droplets}
        />
        <DashboardCard
          to="/contratos"
          title="Contratos"
          description="Obras cadastradas para abastecimento."
          icon={FileText}
        />
      </div>
    </div>
  );
}
