import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Loader2, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { apiGet } from "../../lib/api";
import { glassPanel } from "../../lib/glass";
import type { EstoqueDashboardResposta } from "./EstoqueCombustivelPanel";

type Props = {
  token: string | null;
  obraCodigo?: string;
};

type ObraResumo = {
  codigo: number;
  nome: string;
  saldo_tanques: number;
  tanques_baixo: number;
  melosas: number;
  melosas_baixo: number;
};

function fmtLitros(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

export default function ContratosResumoPanel({ token, obraCodigo }: Props) {
  const [items, setItems] = useState<ObraResumo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const qs = obraCodigo?.trim() ? `?obra_codigo=${encodeURIComponent(obraCodigo.trim())}` : "";
      const json = await apiGet<EstoqueDashboardResposta>(`/v1/estoque/dashboard${qs}`, token);

      const map = new Map<number, ObraResumo>();

      for (const t of json.tanques_registrados ?? []) {
        const obrasVinculadas =
          Array.isArray(t.obra_codigos) && t.obra_codigos.length > 0
            ? t.obra_codigos.map((c) => Number(c)).filter((c) => Number.isFinite(c))
            : [Number(t.obra_codigo)].filter((c) => Number.isFinite(c));
        // Tanque compartilhado: mesmo saldo em cada obra vinculada (não divide o estoque).
        for (const codigo of obrasVinculadas) {
          const cur = map.get(codigo) ?? {
            codigo,
            nome:
              codigo === Number(t.obra_codigo)
                ? String(t.obra_nome ?? "").trim() || `Obra ${codigo}`
                : `Obra ${codigo}`,
            saldo_tanques: 0,
            tanques_baixo: 0,
            melosas: 0,
            melosas_baixo: 0,
          };
          cur.saldo_tanques += Number(t.saldo_litros) || 0;
          if (t.abaixo_ponto_pedido) cur.tanques_baixo += 1;
          if (codigo === Number(t.obra_codigo) && t.obra_nome) {
            cur.nome = String(t.obra_nome).trim();
          }
          map.set(codigo, cur);
        }
      }

      for (const m of json.melosas ?? []) {
        const codigo = m.obra_codigo != null ? Number(m.obra_codigo) : null;
        if (codigo == null || !Number.isFinite(codigo)) continue;
        const cur = map.get(codigo) ?? {
          codigo,
          nome: `Obra ${codigo}`,
          saldo_tanques: 0,
          tanques_baixo: 0,
          melosas: 0,
          melosas_baixo: 0,
        };
        cur.melosas += 1;
        if (m.abaixo_ponto_pedido) cur.melosas_baixo += 1;
        map.set(codigo, cur);
      }

      const list = Array.from(map.values()).sort((a, b) => a.codigo - b.codigo);
      setItems(list);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar resumo");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [obraCodigo, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const totais = useMemo(() => {
    return {
      obras: items.length,
      saldo: items.reduce((s, i) => s + i.saldo_tanques, 0),
      alerta: items.filter((i) => i.tanques_baixo > 0 || i.melosas_baixo > 0).length,
    };
  }, [items]);

  return (
    <section className={`${glassPanel} p-4 md:p-5`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-white/30 pb-4 dark:border-white/10">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-sky-600/10 p-2 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
            <Building2 className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Resumo por contrato</h2>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
              Saldo de tanques e status de melosas por obra
              {totais.obras > 0
                ? ` · ${totais.obras} obra(s) · ${fmtLitros(totais.saldo)} L em tanques`
                : ""}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || !token}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-60 dark:border-white/20 dark:bg-black/20 dark:text-slate-100"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Atualizar
        </button>
      </div>

      {error ? <p className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p> : null}

      {!loading && items.length === 0 && !error ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Nenhum contrato com estoque no filtro atual.</p>
      ) : null}

      {items.length > 0 ? (
        <div className="table-scroll rounded-xl border border-white/40 dark:border-white/10">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="bg-white/40 text-left text-xs font-bold uppercase text-slate-600 dark:bg-white/5 dark:text-slate-300">
                <th className="px-3 py-2">Contrato</th>
                <th className="px-3 py-2 text-right">Saldo tanques (L)</th>
                <th className="px-3 py-2 text-right">Tanques baixos</th>
                <th className="px-3 py-2 text-right">Melosas</th>
                <th className="px-3 py-2">Atalhos</th>
              </tr>
            </thead>
            <tbody>
              {items.map((o, idx) => {
                const zebra = idx % 2 === 0 ? "bg-transparent" : "bg-white/25 dark:bg-white/[0.03]";
                const alerta = o.tanques_baixo > 0 || o.melosas_baixo > 0;
                return (
                  <tr key={o.codigo} className={`${zebra} border-t border-white/30 dark:border-white/5`}>
                    <td className="max-w-[280px] truncate px-3 py-2 font-semibold text-slate-900 dark:text-white" title={`${o.codigo} — ${o.nome}`}>
                      {o.codigo} — {o.nome}
                      {alerta ? (
                        <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                          Atenção
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-800 dark:text-slate-200">
                      {fmtLitros(o.saldo_tanques)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        o.tanques_baixo > 0
                          ? "font-semibold text-amber-800 dark:text-amber-300"
                          : "text-slate-800 dark:text-slate-200"
                      }`}
                    >
                      {o.tanques_baixo}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-800 dark:text-slate-200">
                      {o.melosas}
                      {o.melosas_baixo > 0 ? (
                        <span className="ml-1 text-xs text-amber-700 dark:text-amber-300">
                          ({o.melosas_baixo} baixo)
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2 text-xs font-semibold">
                        <Link className="text-accent hover:underline" to="/bi">
                          BI Tanque
                        </Link>
                        <Link className="text-accent hover:underline" to="/bi/melosa">
                          BI Abast.
                        </Link>
                        <Link className="text-accent hover:underline" to="/consumo-medio">
                          Consumo
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
