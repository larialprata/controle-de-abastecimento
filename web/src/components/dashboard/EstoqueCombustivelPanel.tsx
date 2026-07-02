import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { apiGet } from "../../lib/api";
import { glassPanel, glassSelect } from "../../lib/glass";
import TanqueGrandeVisual from "./TanqueGrandeVisual";

export type EstoqueTanqueItem = {
  combustivel_key: string;
  label: string;
  cor: string;
  saldo_litros: number;
  capacidade_litros: number;
  ocupacao_pct: number;
  ponto_pedido_litros: number;
  abaixo_ponto_pedido: boolean;
  total_entrada: number;
  total_retirada_alocada: number;
};

export type EstoqueMelosaItem = {
  ativo: string;
  saldo_litros: number;
  capacidade_litros: number | null;
  ocupacao_pct: number | null;
  ponto_pedido_litros: number | null;
  abaixo_ponto_pedido: boolean;
  ultimo_ciclo_numero: number | null;
  obra_codigo: number | null;
};

export type EstoqueDashboardResposta = {
  obra_codigo: number | null;
  tanque_total: {
    saldo_litros: number;
    total_entrada: number;
    total_retirada: number;
    total_devolvido: number;
  };
  tanques_por_combustivel: EstoqueTanqueItem[];
  melosas: EstoqueMelosaItem[];
};

type ObraOption = { codigo: number; nome: string };

type Props = {
  token: string | null;
  ativoMelosa?: string;
};

const labelCls =
  "text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400";

function metricasMelosa(m: EstoqueMelosaItem) {
  const cap = m.capacidade_litros ?? 5_000;
  const ocup = m.ocupacao_pct ?? (cap > 0 ? (m.saldo_litros / cap) * 100 : 0);
  return { cap, ocup };
}

export default function EstoqueCombustivelPanel({ token, ativoMelosa = "" }: Props) {
  const [obras, setObras] = useState<ObraOption[]>([]);
  const [obraCodigo, setObraCodigo] = useState<string>("");
  const [data, setData] = useState<EstoqueDashboardResposta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiGet<{ obras: ObraOption[] }>("/v1/obras", token)
      .then((json) => setObras(json?.obras ?? []))
      .catch(() => setObras([]));
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (obraCodigo) params.set("obra_codigo", obraCodigo);
      const json = await apiGet<EstoqueDashboardResposta>(
        `/v1/estoque/dashboard?${params}`,
        token,
      );
      setData(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar estoque.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token, obraCodigo]);

  useEffect(() => {
    load();
  }, [load]);

  const dieselS10 = data?.tanques_por_combustivel.find((t) => t.combustivel_key === "DIESEL_S10");
  const melosasLista = data?.melosas ?? [];
  const filtroMelosa = ativoMelosa.trim().toUpperCase();

  return (
    <section className={`${glassPanel} overflow-hidden p-4 md:p-6`}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-white/30 pb-4 dark:border-white/10">
        <h2 className="text-lg font-bold uppercase tracking-wide text-slate-900 dark:text-white">
          Dashboard estoque tanques
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={`${glassSelect} min-w-[10rem]`}
            value={obraCodigo}
            onChange={(e) => setObraCodigo(e.target.value)}
            aria-label="Filtrar por obra"
          >
            <option value="">Todas as obras</option>
            {obras.map((o) => (
              <option key={o.codigo} value={String(o.codigo)}>
                {o.codigo} — {o.nome}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/40 bg-white/50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white/70 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </button>
        </div>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-300/60 bg-red-50/80 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {loading && !data ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin" />
          Carregando estoque…
        </div>
      ) : null}

      {data ? (
        <div className="space-y-6">
          <div>
            <p className={`${labelCls} mb-3`}>Tanque da obra</p>
            <div className="flex justify-center sm:justify-start">
              {dieselS10 ? (
                <TanqueGrandeVisual
                  tipo="tanque"
                  titulo="Diesel S10"
                  saldoLitros={dieselS10.saldo_litros}
                  capacidadeLitros={dieselS10.capacidade_litros}
                  ocupacaoPct={dieselS10.ocupacao_pct}
                  cor={dieselS10.cor}
                  abaixoPonto={dieselS10.abaixo_ponto_pedido}
                />
              ) : (
                <p className="py-6 text-sm text-slate-500 dark:text-slate-400">
                  Sem dados de Diesel S10 no filtro atual.
                </p>
              )}
            </div>
          </div>

          <div>
            <p className={`${labelCls} mb-3`}>
              Melosas {melosasLista.length > 0 ? `(${melosasLista.length})` : ""}
            </p>
            {melosasLista.length > 0 ? (
              <div className="grid grid-cols-2 justify-items-center gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {melosasLista.map((m) => {
                  const { cap, ocup } = metricasMelosa(m);
                  const destacada = filtroMelosa.length > 0 && m.ativo.toUpperCase() === filtroMelosa;
                  return (
                    <div
                      key={m.ativo}
                      className={
                        destacada
                          ? "rounded-2xl ring-2 ring-sky-500 ring-offset-2 ring-offset-transparent dark:ring-offset-slate-900"
                          : ""
                      }
                    >
                      <TanqueGrandeVisual
                        tipo="melosa"
                        titulo={m.ativo}
                        saldoLitros={m.saldo_litros}
                        capacidadeLitros={cap}
                        ocupacaoPct={ocup}
                        cor="#0EA5E9"
                        abaixoPonto={m.abaixo_ponto_pedido}
                        subtitulo={
                          m.ultimo_ciclo_numero != null ? `Ciclo ${m.ultimo_ciclo_numero}` : undefined
                        }
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
                Nenhuma melosa cadastrada no filtro atual.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
