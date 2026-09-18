import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { apiGet } from "../../lib/api";
import { glassPanel } from "../../lib/glass";
import TanqueGrandeVisual from "./TanqueGrandeVisual";
import EstoqueDetalheModal, { type EstoqueDetalheAlvo } from "./EstoqueDetalheModal";

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

export type EstoqueTanqueRegistradoItem = {
  ativo: string;
  nome: string | null;
  obra_codigo: number;
  obra_codigos?: number[];
  obra_nome: string | null;
  tanque_numero: number;
  label: string;
  saldo_litros: number;
  capacidade_litros: number;
  ocupacao_pct: number;
  ponto_pedido_litros: number;
  abaixo_ponto_pedido: boolean;
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

export type EstoqueTanqueObraItem = {
  ativo: string;
  nome: string | null;
  obra_codigo: number;
  obra_nome: string | null;
  tanque_numero: number;
  capacidade_litros: number;
  saldo_litros: number;
  ocupacao_pct: number;
  ponto_pedido_litros: number;
  abaixo_ponto_pedido: boolean;
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
  tanques_registrados: EstoqueTanqueRegistradoItem[];
  melosas: EstoqueMelosaItem[];
};

type Props = {
  token: string | null;
  ativoMelosa?: string;
  obraCodigo?: string;
};

const labelCls =
  "text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400";

function metricasMelosa(m: EstoqueMelosaItem) {
  const cap = m.capacidade_litros ?? 5_000;
  const ocup = m.ocupacao_pct ?? (cap > 0 ? (m.saldo_litros / cap) * 100 : 0);
  return { cap, ocup };
}

export default function EstoqueCombustivelPanel({
  token,
  ativoMelosa = "",
  obraCodigo = "",
}: Props) {
  const [data, setData] = useState<EstoqueDashboardResposta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<EstoqueDetalheAlvo | null>(null);

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

  const dieselS10 = data?.tanques_por_combustivel?.find((t) => t.combustivel_key === "DIESEL_S10");
  const tanquesRegistrados = data?.tanques_registrados ?? [];
  const filtroMelosa = ativoMelosa.trim().toUpperCase();
  const melosasLista = (data?.melosas ?? []).filter((m) => {
    if (!filtroMelosa) return true;
    return m.ativo.toUpperCase().includes(filtroMelosa);
  });

  return (
    <section className={`${glassPanel} overflow-hidden p-4 md:p-6`}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-white/30 pb-4 dark:border-white/10">
        <h2 className="text-lg font-bold uppercase tracking-wide text-slate-900 dark:text-white">
          Dashboard estoque tanques
        </h2>
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
            <p className={`${labelCls} mb-3`}>
              Tanques da obra {tanquesRegistrados.length > 0 ? `(${tanquesRegistrados.length})` : ""}
            </p>
            {tanquesRegistrados.length > 0 ? (
              <div className="grid grid-cols-2 justify-items-center gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {tanquesRegistrados.map((t) => (
                  <TanqueGrandeVisual
                    key={`${t.obra_codigo}-${t.tanque_numero}-${t.ativo}`}
                    tipo="tanque"
                    titulo={t.label}
                    saldoLitros={t.saldo_litros}
                    capacidadeLitros={t.capacidade_litros}
                    ocupacaoPct={t.ocupacao_pct}
                    cor={dieselS10?.cor ?? "#EAB308"}
                    abaixoPonto={t.abaixo_ponto_pedido}
                    subtitulo={
                      t.obra_nome ? `${t.obra_codigo} · ${t.obra_nome}` : `Obra ${t.obra_codigo}`
                    }
                    onClick={() => setDetalhe({ kind: "tanque", item: t })}
                  />
                ))}
              </div>
            ) : dieselS10 ? (
              <div className="flex justify-center sm:justify-start">
                <TanqueGrandeVisual
                  tipo="tanque"
                  titulo="Diesel S10"
                  saldoLitros={dieselS10.saldo_litros}
                  capacidadeLitros={dieselS10.capacidade_litros}
                  ocupacaoPct={dieselS10.ocupacao_pct}
                  cor={dieselS10.cor}
                  abaixoPonto={dieselS10.abaixo_ponto_pedido}
                />
              </div>
            ) : (
              <p className="py-6 text-sm text-slate-500 dark:text-slate-400">
                Nenhum tanque cadastrado no filtro atual.
              </p>
            )}
          </div>

          {dieselS10 ? (
            <div className="rounded-xl border border-white/30 bg-white/20 px-4 py-3 text-sm dark:border-white/10 dark:bg-white/5">
              <p className="font-semibold text-slate-800 dark:text-slate-200">Resumo Diesel S10 (todas entradas)</p>
              <p className="mt-1 tabular-nums text-slate-600 dark:text-slate-400">
                Saldo agregado: {new Intl.NumberFormat("pt-BR").format(dieselS10.saldo_litros)} L
              </p>
            </div>
          ) : null}

          <div>
            <p className={`${labelCls} mb-3`}>
              Melosas {melosasLista.length > 0 ? `(${melosasLista.length})` : ""}
            </p>
            {melosasLista.length > 0 ? (
              <div className="grid grid-cols-2 justify-items-center gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {melosasLista.map((m) => {
                  const { cap, ocup } = metricasMelosa(m);
                  return (
                    <div key={m.ativo}>
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
                        onClick={() => setDetalhe({ kind: "melosa", item: m })}
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

      {detalhe ? (
        <EstoqueDetalheModal alvo={detalhe} token={token} onClose={() => setDetalhe(null)} />
      ) : null}
    </section>
  );
}
