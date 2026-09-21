import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowDown, ArrowUp, ExternalLink, Fuel, Loader2, X } from "lucide-react";
import { apiGet } from "../../lib/api";
import { fmtLitrosDashboard } from "../../lib/combustivelControle";
import { fmtEquipamentoTicketLabel } from "../../lib/equipamentoTicketLabel";
import { glassPanel } from "../../lib/glass";
import type {
  EstoqueMelosaItem,
  EstoqueTanqueRegistradoItem,
} from "./EstoqueCombustivelPanel";

export type EstoqueDetalheAlvo =
  | { kind: "tanque"; item: EstoqueTanqueRegistradoItem }
  | { kind: "melosa"; item: EstoqueMelosaItem };

type Props = {
  alvo: EstoqueDetalheAlvo;
  token: string | null;
  onClose: () => void;
};

type Movimentacao = Record<string, unknown> & {
  id?: string;
  operation_id?: string;
  tipo?: string;
  origem?: string;
  data_hora?: string;
  litros?: number | string | null;
  obra_codigo?: number;
  obra_nome?: string | null;
  tanque_numero?: number | string | null;
  tanque_quantidade_abastecida?: string | null;
  combustivel_tipo?: string | null;
  fornecedor_texto?: string | null;
  placa_texto?: string | null;
  placa_caminhao?: string | null;
  ativo_melosa_texto?: string | null;
  ativo_equipamento_texto?: string | null;
  ativo_equipamento_nome?: string | null;
  melosa_quantidade_abastecida?: string | null;
  melosa_combustivel_tipo_retirada?: string | null;
  melosa_combustivel_tipo_registro?: string | null;
  melosa_horimetro_equipamento_abastecido_numero?: string | null;
  melosa_motorista_equipamento_abastecido?: string | null;
  melosa_operador_nome?: string | null;
  usuario_full_name?: string | null;
};

const PAGE_SIZE = 500;
const MAX_PAGES = 60;

const thCls =
  "sticky top-0 z-[1] whitespace-nowrap border-b border-white/30 bg-white/60 px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-slate-600 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/70 dark:text-slate-300";

const tdCls =
  "border-b border-white/25 px-3 py-2 align-middle text-slate-800 dark:border-white/5 dark:text-slate-200";

function parseNumero(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

function fmtDataHora(v: unknown): string {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function litrosMelosa(m: Movimentacao): number {
  const q = parseNumero(m.melosa_quantidade_abastecida);
  if (q != null && q > 0) return q;
  return parseNumero(m.litros) ?? 0;
}

function litrosRetiradaTanque(m: Movimentacao): number {
  const q = parseNumero(m.tanque_quantidade_abastecida);
  if (q != null && q > 0) return q;
  return parseNumero(m.litros) ?? 0;
}

function insumoMelosa(m: Movimentacao): string {
  return fmt(m.melosa_combustivel_tipo_retirada ?? m.melosa_combustivel_tipo_registro);
}

function equipamentoLabel(m: Movimentacao): string {
  return fmtEquipamentoTicketLabel(
    m.ativo_equipamento_texto ?? m.fornecedor_texto,
    m.ativo_equipamento_nome,
  );
}

/** yyyy-mm-dd (local) para preencher os filtros de data do BID. */
function toDiaInput(v: unknown): string | null {
  if (!v) return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${dia}`;
}

function ResumoBox({
  label,
  valor,
  destaque,
}: {
  label: string;
  valor: string;
  destaque?: "azul" | "verde" | "ambar" | "neutro";
}) {
  const tone =
    destaque === "azul"
      ? "border-sky-200/80 bg-sky-50/80 dark:border-sky-900/40 dark:bg-sky-950/30"
      : destaque === "verde"
        ? "border-emerald-200/80 bg-emerald-50/80 dark:border-emerald-900/40 dark:bg-emerald-950/30"
        : destaque === "ambar"
          ? "border-amber-200/80 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-950/30"
          : "border-slate-200/80 bg-slate-50/70 dark:border-white/10 dark:bg-white/[0.04]";
  return (
    <div className={`rounded-xl border px-4 py-3 ${tone}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900 dark:text-white">{valor}</p>
    </div>
  );
}

export default function EstoqueDetalheModal({ alvo, token, onClose }: Props) {
  const navigate = useNavigate();
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const irParaBiAbastecimento = useCallback(
    (m: Movimentacao) => {
      const op = String(m.operation_id ?? "").trim();
      if (!op) return;
      const params = new URLSearchParams();
      params.set("op", op);
      const dia = toDiaInput(m.data_hora);
      if (dia) {
        params.set("de", dia);
        params.set("ate", dia);
      }
      onClose();
      navigate(`/bi/melosa?${params.toString()}`);
    },
    [navigate, onClose],
  );

  const isMelosa = alvo.kind === "melosa";
  const titulo = isMelosa ? alvo.item.ativo : alvo.item.label;
  const saldo = alvo.item.saldo_litros;
  const capacidade = isMelosa ? alvo.item.capacidade_litros ?? 0 : alvo.item.capacidade_litros;
  const ocupacao = isMelosa ? alvo.item.ocupacao_pct ?? 0 : alvo.item.ocupacao_pct;
  const pontoPedido = isMelosa
    ? alvo.item.ponto_pedido_litros ?? 0
    : alvo.item.ponto_pedido_litros;
  const abaixoPonto = alvo.item.abaixo_ponto_pedido;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const origem = isMelosa ? "melosa" : "tanque";
      const rows: Movimentacao[] = [];
      let offset = 0;
      for (let i = 0; i < MAX_PAGES; i += 1) {
        const chunk = await apiGet<{ movimentacoes: Movimentacao[] }>(
          `/v1/movimentacoes?limit=${PAGE_SIZE}&offset=${offset}&origem=${origem}`,
          token,
        );
        const list = chunk?.movimentacoes ?? [];
        rows.push(...list);
        if (list.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
      setMovimentacoes(rows);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar abastecimentos.");
      setMovimentacoes([]);
    } finally {
      setLoading(false);
    }
  }, [isMelosa, token]);

  useEffect(() => {
    load();
  }, [load]);

  const filtradas = useMemo(() => {
    if (isMelosa) {
      const ativo = alvo.item.ativo.trim().toUpperCase();
      return movimentacoes.filter((m) => {
        const placa = String(m.ativo_melosa_texto ?? m.placa_texto ?? "").trim().toUpperCase();
        return placa === ativo;
      });
    }
    const obrasTanque = new Set(
      (alvo.item.obra_codigos?.length ? alvo.item.obra_codigos : [alvo.item.obra_codigo]).filter(
        (c): c is number => typeof c === "number" && Number.isFinite(c),
      ),
    );
    const tanqueNum = alvo.item.tanque_numero;
    const cutoffRaw = alvo.item.saldo_inicial_em;
    const cutoffMs = cutoffRaw ? new Date(cutoffRaw).getTime() : null;
    const cutoffOk = cutoffMs != null && Number.isFinite(cutoffMs);

    return movimentacoes.filter((m) => {
      if (typeof m.obra_codigo !== "number" || !obrasTanque.has(m.obra_codigo)) return false;
      const num = parseNumero(m.tanque_numero);
      if (num !== tanqueNum) return false;
      // Alinha com o estoque: só movimentos na/após a data da quantidade cadastrada.
      if (cutoffOk) {
        const dh = m.data_hora ? new Date(String(m.data_hora)).getTime() : NaN;
        if (!Number.isFinite(dh) || dh < cutoffMs!) return false;
      }
      return true;
    });
  }, [alvo, isMelosa, movimentacoes]);

  const totais = useMemo(() => {
    if (isMelosa) {
      const total = filtradas.reduce((s, m) => s + litrosMelosa(m), 0);
      return { total, count: filtradas.length };
    }
    let entrada = 0;
    let retirada = 0;
    filtradas.forEach((m) => {
      if (m.tipo === "ENTRADA_TANQUE_OBRA") entrada += parseNumero(m.litros) ?? 0;
      else if (m.tipo === "RETIRADA_TANQUE") retirada += litrosRetiradaTanque(m);
    });
    const saldoInicial = Number(alvo.kind === "tanque" ? alvo.item.saldo_inicial_litros ?? 0 : 0);
    return { entrada, retirada, saldoInicial, count: filtradas.length };
  }, [alvo, filtradas, isMelosa]);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="estoque-detalhe-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`my-4 w-full max-w-4xl rounded-2xl p-5 shadow-2xl ${glassPanel}`}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-white/30 pb-4 dark:border-white/10">
          <div className="flex items-start gap-3">
            <div
              className={`rounded-lg p-2 ${
                isMelosa
                  ? "bg-sky-600/10 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400"
                  : "bg-amber-600/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
              }`}
            >
              <Fuel className="h-5 w-5" />
            </div>
            <div>
              <h2 id="estoque-detalhe-title" className="text-lg font-bold text-slate-900 dark:text-white">
                {isMelosa ? "Melosa" : "Tanque"} — {titulo}
              </h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
                {abaixoPonto ? (
                  <>
                    <ArrowDown className="h-4 w-4 text-red-500" />
                    Abaixo do ponto de pedido
                  </>
                ) : (
                  <>
                    <ArrowUp className="h-4 w-4 text-emerald-500" />
                    Nível saudável
                  </>
                )}
                {isMelosa && alvo.item.ultimo_ciclo_numero != null
                  ? ` · Ciclo ${alvo.item.ultimo_ciclo_numero}`
                  : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 dark:border-white/20 dark:bg-black/20 dark:text-slate-100"
          >
            <X className="h-4 w-4" />
            Fechar
          </button>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ResumoBox label="Saldo atual" valor={`${fmtLitrosDashboard(saldo)} L`} destaque="azul" />
          <ResumoBox label="Capacidade" valor={`${fmtLitrosDashboard(capacidade)} L`} />
          <ResumoBox label="Ocupação" valor={`${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(ocupacao)}%`} />
          <ResumoBox label="Ponto de pedido" valor={`${fmtLitrosDashboard(pontoPedido)} L`} destaque={abaixoPonto ? "ambar" : "neutro"} />
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {isMelosa ? (
            <>
              <ResumoBox label="Total abastecido" valor={`${fmtLitrosDashboard(totais.total ?? 0)} L`} destaque="verde" />
              <ResumoBox label="Nº de abastecimentos" valor={String(totais.count)} />
            </>
          ) : (
            <>
              <ResumoBox
                label="Qtd. cadastrada (base)"
                valor={`${fmtLitrosDashboard(totais.saldoInicial ?? 0)} L`}
              />
              <ResumoBox label="Entradas (após base)" valor={`${fmtLitrosDashboard(totais.entrada ?? 0)} L`} destaque="verde" />
              <ResumoBox label="Retiradas (após base)" valor={`${fmtLitrosDashboard(totais.retirada ?? 0)} L`} destaque="ambar" />
            </>
          )}
        </div>

        {!isMelosa ? (
          <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">
            O saldo do tanque é: quantidade cadastrada + entradas − retiradas{" "}
            <strong>depois</strong> da data/hora da quantidade. Abastecimentos feitos pela melosa (saída da melosa para
            equipamento) não baixam o estoque do tanque — só a <strong>retirada do tanque</strong> (para melosa ou
            equipamento) abate.
            {alvo.kind === "tanque" && alvo.item.saldo_inicial_em
              ? ` Base desde ${fmtDataHora(alvo.item.saldo_inicial_em)}.`
              : ""}
          </p>
        ) : null}

        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-700 dark:text-slate-300">
          {isMelosa ? "Abastecimentos" : "Movimentações que alteram o estoque"}
        </h3>

        {error ? (
          <p className="mb-3 flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin" />
            Carregando…
          </div>
        ) : (
          <div className="table-scroll rounded-xl border border-white/30 dark:border-white/10" style={{ maxHeight: "min(24rem, 45vh)" }}>
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                {isMelosa ? (
                  <tr>
                    <th className={thCls}>Data/hora</th>
                    <th className={thCls}>Equipamento</th>
                    <th className={thCls}>Litros</th>
                    <th className={thCls}>Insumo</th>
                    <th className={thCls}>Horímetro</th>
                    <th className={thCls}>Motorista</th>
                    <th className={thCls}>Obra</th>
                    <th className={thCls}>Ver no BI</th>
                  </tr>
                ) : (
                  <tr>
                    <th className={thCls}>Data/hora</th>
                    <th className={thCls}>Tipo</th>
                    <th className={thCls}>Litros</th>
                    <th className={thCls}>Insumo</th>
                    <th className={thCls}>Placa / Fornecedor</th>
                    <th className={thCls}>Obra</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {filtradas.map((m, idx) => {
                  const zebra = idx % 2 === 0 ? "bg-transparent" : "bg-white/30 dark:bg-white/[0.04]";
                  const key = String(m.operation_id ?? m.id ?? idx);
                  if (isMelosa) {
                    const temOp = Boolean(String(m.operation_id ?? "").trim());
                    return (
                      <tr
                        key={key}
                        className={`${zebra} ${temOp ? "cursor-pointer transition hover:bg-sky-50/70 dark:hover:bg-sky-950/30" : ""}`}
                        onClick={temOp ? () => irParaBiAbastecimento(m) : undefined}
                        title={temOp ? "Abrir no BI Abastecimentos" : undefined}
                      >
                        <td className={`${tdCls} whitespace-nowrap`}>{fmtDataHora(m.data_hora)}</td>
                        <td className={tdCls}>{equipamentoLabel(m)}</td>
                        <td className={`${tdCls} whitespace-nowrap font-semibold tabular-nums`}>
                          {fmtLitrosDashboard(litrosMelosa(m))} L
                        </td>
                        <td className={tdCls}>{insumoMelosa(m)}</td>
                        <td className={tdCls}>{fmt(m.melosa_horimetro_equipamento_abastecido_numero)}</td>
                        <td className={tdCls}>{fmt(m.melosa_motorista_equipamento_abastecido)}</td>
                        <td className={tdCls}>
                          {m.obra_codigo ?? "—"}
                          {m.obra_nome ? ` · ${m.obra_nome}` : ""}
                        </td>
                        <td className={tdCls}>
                          {temOp ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                irParaBiAbastecimento(m);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-sky-300 bg-sky-50/80 px-2 py-1 text-xs font-semibold text-sky-800 transition hover:bg-sky-100 dark:border-sky-800/60 dark:bg-sky-950/30 dark:text-sky-200"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Ver
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  }
                  const tipoLabel =
                    m.tipo === "ENTRADA_TANQUE_OBRA"
                      ? "Entrada"
                      : m.tipo === "RETIRADA_TANQUE"
                        ? "Retirada"
                        : fmt(m.tipo);
                  return (
                    <tr key={key} className={zebra}>
                      <td className={`${tdCls} whitespace-nowrap`}>{fmtDataHora(m.data_hora)}</td>
                      <td className={tdCls}>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            m.tipo === "ENTRADA_TANQUE_OBRA"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                          }`}
                        >
                          {tipoLabel}
                        </span>
                      </td>
                      <td className={`${tdCls} whitespace-nowrap font-semibold tabular-nums`}>
                        {fmtLitrosDashboard(
                          m.tipo === "RETIRADA_TANQUE"
                            ? litrosRetiradaTanque(m)
                            : parseNumero(m.litros) ?? 0,
                        )}{" "}
                        L
                      </td>
                      <td className={tdCls}>{fmt(m.combustivel_tipo)}</td>
                      <td className={tdCls}>{fmt(m.placa_texto ?? m.placa_caminhao ?? m.fornecedor_texto)}</td>
                      <td className={tdCls}>
                        {m.obra_codigo ?? "—"}
                        {m.obra_nome ? ` · ${m.obra_nome}` : ""}
                      </td>
                    </tr>
                  );
                })}
                {filtradas.length === 0 ? (
                  <tr>
                    <td colSpan={isMelosa ? 8 : 6} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">
                      Nenhum {isMelosa ? "abastecimento" : "registro"} encontrado para {titulo}.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
