import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronRight, Loader2 } from "lucide-react";
import { apiGet } from "../../lib/api";
import { fmtLitrosDashboard } from "../../lib/combustivelControle";
import { defaultPeriodoMesAtual, toDateInputValue } from "../../lib/aggregateCombustivelDashboard";
import { glassPanel } from "../../lib/glass";

type Papel = "motorista" | "operador" | "usuario";

type AlertaItem = {
  id: string;
  tipo: string;
  data_hora: string;
  obra_codigo: number | null;
  obra_nome: string | null;
  ativo_melosa: string | null;
  ativo_equipamento: string | null;
  motorista: string | null;
  operador: string | null;
  usuario: string | null;
  local_address: string | null;
  litros: number | null;
  volume_suspeito: number | null;
  titulo: string;
  link_bi: string | null;
};

type RankingPessoa = {
  pessoa: string;
  papel: Papel;
  alertas: number;
  volume_suspeito: number;
};

type AlertasResposta = {
  alertas: AlertaItem[];
  kpis: { total: number; volume_suspeito_litros: number };
  ranking_pessoas: RankingPessoa[];
};

const GRUPOS: { papel: Papel; titulo: string }[] = [
  { papel: "motorista", titulo: "Motoristas" },
  { papel: "operador", titulo: "Operários" },
  { papel: "usuario", titulo: "Usuários do app" },
];

const TIPO_LABEL: Record<string, string> = {
  capacidade_ultrapassada: "Capacidade",
  fechamento_ciclo: "Fechamento",
  litros_vs_quantidade: "Litros divergentes",
  gps_ausente: "Sem GPS",
  volume_outlier: "Volume alto",
  sem_foto_obrigatoria: "Sem foto",
};

function fmtDt(v: string | null | undefined): string {
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

function alertaPertenceA(a: AlertaItem, pessoa: string, papel: Papel): boolean {
  const nome = pessoa.trim().toUpperCase();
  if (papel === "motorista") return String(a.motorista ?? "").trim().toUpperCase() === nome;
  if (papel === "operador") return String(a.operador ?? "").trim().toUpperCase() === nome;
  return String(a.usuario ?? "").trim().toUpperCase() === nome;
}

type Props = {
  token: string | null;
  obraCodigo?: string;
};

export default function SuspeitasDashboardPanel({ token, obraCodigo }: Props) {
  const periodo = useMemo(() => defaultPeriodoMesAtual(), []);
  const [data, setData] = useState<AlertasResposta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selecionada, setSelecionada] = useState<{ pessoa: string; papel: Papel } | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("de", toDateInputValue(periodo.de));
      params.set("ate", toDateInputValue(periodo.ate));
      if (obraCodigo?.trim()) params.set("obra_codigo", obraCodigo.trim());
      const res = await apiGet<AlertasResposta>(`/v1/alertas?${params}`, token);
      setData(res);
      setSelecionada(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar suspeitas.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token, obraCodigo, periodo.de, periodo.ate]);

  useEffect(() => {
    void load();
  }, [load]);

  const porGrupo = useMemo(() => {
    const ranking = data?.ranking_pessoas ?? [];
    return GRUPOS.map((g) => ({
      ...g,
      itens: ranking
        .filter((r) => r.papel === g.papel)
        .sort((a, b) => b.volume_suspeito - a.volume_suspeito || a.pessoa.localeCompare(b.pessoa, "pt-BR")),
    })).filter((g) => g.itens.length > 0);
  }, [data?.ranking_pessoas]);

  const detalhes = useMemo(() => {
    if (!selecionada || !data) return [];
    return data.alertas
      .filter((a) => alertaPertenceA(a, selecionada.pessoa, selecionada.papel))
      .sort((a, b) => String(b.data_hora).localeCompare(String(a.data_hora)));
  }, [data, selecionada]);

  return (
    <section className={`${glassPanel} p-4 md:p-5`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-white/30 pb-4 dark:border-white/10">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-red-600/10 p-2 text-red-700 dark:bg-red-500/15 dark:text-red-300">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Suspeitas</h2>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
              Mês atual · clique no nome para ver horário e local
              {data ? ` · ${data.kpis.total} alertas · ${fmtLitrosDashboard(data.kpis.volume_suspeito_litros)} L` : ""}
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {loading && !data ? (
        <div className="flex items-center justify-center gap-2 py-10 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando…
        </div>
      ) : porGrupo.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">Nenhuma suspeita com pessoa no período.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="max-h-[420px] space-y-4 overflow-y-auto pr-1">
            {porGrupo.map((grupo) => (
              <div key={grupo.papel}>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {grupo.titulo} ({grupo.itens.length})
                </p>
                <ul className="divide-y divide-slate-200/70 overflow-hidden rounded-xl border border-slate-200/70 dark:divide-white/10 dark:border-white/10">
                  {grupo.itens.map((r) => {
                    const ativo =
                      selecionada?.pessoa === r.pessoa && selecionada?.papel === r.papel;
                    return (
                      <li key={`${r.papel}-${r.pessoa}`}>
                        <button
                          type="button"
                          onClick={() =>
                            setSelecionada(ativo ? null : { pessoa: r.pessoa, papel: r.papel })
                          }
                          className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
                            ativo
                              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                              : "bg-white/40 hover:bg-slate-100/80 dark:bg-black/10 dark:hover:bg-white/10"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{r.pessoa}</p>
                            <p className={`text-xs ${ativo ? "opacity-70" : "text-slate-500"}`}>
                              {r.alertas} ocorrências
                            </p>
                          </div>
                          <span className="shrink-0 text-sm font-bold tabular-nums">
                            {fmtLitrosDashboard(r.volume_suspeito)} L
                          </span>
                          <ChevronRight className={`h-4 w-4 shrink-0 opacity-40 ${ativo ? "rotate-90" : ""}`} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200/70 bg-white/30 p-3 dark:border-white/10 dark:bg-black/15">
            {!selecionada ? (
              <p className="flex min-h-[180px] items-center justify-center text-sm text-slate-500">
                Selecione um nome
              </p>
            ) : (
              <>
                <div className="mb-3 border-b border-slate-200/70 pb-2 dark:border-white/10">
                  <p className="font-bold text-slate-900 dark:text-white">{selecionada.pessoa}</p>
                  <p className="text-xs text-slate-500">
                    {GRUPOS.find((g) => g.papel === selecionada.papel)?.titulo}
                  </p>
                </div>
                <ol className="max-h-[360px] space-y-0 overflow-y-auto">
                  {detalhes.map((a, idx) => (
                    <li
                      key={a.id}
                      className="border-b border-slate-100 py-2.5 last:border-0 dark:border-white/5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs tabular-nums text-slate-500">
                            {idx + 1}. {fmtDt(a.data_hora)}
                          </p>
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {TIPO_LABEL[a.tipo] ?? a.titulo}
                          </p>
                          <p className="text-xs text-slate-500">
                            Local: {a.local_address?.trim() || "Não informado"}
                          </p>
                          {a.obra_codigo != null ? (
                            <p className="text-xs text-slate-500">
                              Obra {a.obra_codigo}
                              {a.obra_nome ? ` · ${a.obra_nome}` : ""}
                            </p>
                          ) : null}
                          {a.link_bi ? (
                            <Link to={a.link_bi} className="text-xs font-semibold text-accent hover:underline">
                              Ver no BI
                            </Link>
                          ) : null}
                        </div>
                        <span className="shrink-0 text-sm font-bold tabular-nums">
                          {fmtLitrosDashboard(a.volume_suspeito ?? a.litros ?? 0)} L
                        </span>
                      </div>
                    </li>
                  ))}
                  {detalhes.length === 0 ? (
                    <li className="py-6 text-center text-sm text-slate-500">Sem ocorrências.</li>
                  ) : null}
                </ol>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
