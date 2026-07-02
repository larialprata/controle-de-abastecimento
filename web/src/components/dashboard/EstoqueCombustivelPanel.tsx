import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { apiGet } from "../../lib/api";
import { glassField, glassPanel, glassSelect } from "../../lib/glass";
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

  const melosaExibida = (() => {
    if (!data?.melosas.length) return null;
    const filtro = ativoMelosa.trim().toUpperCase();
    if (filtro) {
      const found = data.melosas.find((m) => m.ativo.toUpperCase() === filtro);
      if (found) return found;
    }
    return data.melosas[0];
  })();

  const melosaCap = melosaExibida?.capacidade_litros ?? 5_000;
  const melosaOcup = melosaExibida
    ? (melosaExibida.ocupacao_pct ??
      (melosaCap > 0 ? (melosaExibida.saldo_litros / melosaCap) * 100 : 0))
    : 0;
  const melosaPonto = melosaExibida?.ponto_pedido_litros ?? melosaCap * 0.2;

  return (
    <section className={`${glassPanel} overflow-hidden p-4 md:p-6`}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-white/30 pb-4 dark:border-white/10">
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
        <div className="flex items-center justify-center gap-2 py-24 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin" />
          Carregando estoque…
        </div>
      ) : null}

      {data ? (
        <div className="mx-auto flex max-w-md flex-col items-center gap-10 py-2">
          {dieselS10 ? (
            <TanqueGrandeVisual
              titulo="Diesel S10 — Tanque — Estoque"
              saldoLitros={dieselS10.saldo_litros}
              capacidadeLitros={dieselS10.capacidade_litros}
              ocupacaoPct={dieselS10.ocupacao_pct}
              cor={dieselS10.cor}
              pontoPedidoLitros={dieselS10.ponto_pedido_litros}
              abaixoPonto={dieselS10.abaixo_ponto_pedido}
            />
          ) : (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Sem dados de Diesel S10 no filtro atual.
            </p>
          )}

          <div className="h-px w-full max-w-xs bg-gradient-to-r from-transparent via-slate-300/60 to-transparent dark:via-slate-600/40" />

          {melosaExibida ? (
            <TanqueGrandeVisual
              titulo={`${melosaExibida.ativo} — Melosa — Estoque`}
              saldoLitros={melosaExibida.saldo_litros}
              capacidadeLitros={melosaCap}
              ocupacaoPct={melosaOcup}
              cor="#0EA5E9"
              pontoPedidoLitros={melosaPonto}
              abaixoPonto={melosaExibida.abaixo_ponto_pedido}
              subtitulo={
                melosaExibida.ultimo_ciclo_numero != null
                  ? `Último ciclo ID ${melosaExibida.ultimo_ciclo_numero}`
                  : undefined
              }
            />
          ) : (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Nenhuma melosa com ciclo registrado no filtro atual.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
