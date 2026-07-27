import { ArrowDown, ArrowUp, ChevronRight, Minus } from "lucide-react";
import { fmtLitrosDashboard } from "../../lib/combustivelControle";
import {
  badgeClasses,
  type ConsumoEquipamento,
  type EquipamentoAnalise,
} from "../../lib/consumoMedioAnalise";
import ConsumoMedioMetaBar from "./ConsumoMedioMetaBar";
import { fmtDataBr, fmtUnidade, nivelDotClass, tdCls, thCls } from "./consumoMedioUi";

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
      <span className="inline-flex items-center gap-0.5 font-semibold text-red-600 dark:text-red-400">
        <ArrowUp className="h-3 w-3" />
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 font-semibold text-emerald-600 dark:text-emerald-400">
      <ArrowDown className="h-3 w-3" />
      {label}
    </span>
  );
}

type Props = {
  equipamentos: ConsumoEquipamento[];
  analises: Map<string, EquipamentoAnalise>;
  compararPeriodo: boolean;
  selectedAtivo: string | null;
  loading: boolean;
  onSelect: (ativo: string) => void;
  entityLabel?: string;
};

export default function ConsumoMedioEquipamentosTable({
  equipamentos,
  analises,
  compararPeriodo,
  selectedAtivo,
  loading,
  onSelect,
  entityLabel = "Equipamento",
}: Props) {
  return (
    <div className="table-scroll overflow-hidden rounded-2xl border border-slate-200/80 bg-white/40 dark:border-white/10 dark:bg-black/20">
      <table className="w-full min-w-[920px] border-collapse">
        <thead>
          <tr>
            <th className={thCls}>{entityLabel}</th>
            <th className={thCls}>Status</th>
            <th className={`${thCls} min-w-[200px]`}>Consumo vs meta</th>
            {compararPeriodo ? <th className={thCls}>vs anterior</th> : null}
            <th className={thCls}>Litros</th>
            <th className={thCls}>Horas/km</th>
            <th className={thCls}>Trechos</th>
            <th className={thCls}>Último abast.</th>
            <th className={`${thCls} w-10`} aria-hidden />
          </tr>
        </thead>
        <tbody>
          {equipamentos.map((eq, idx) => {
            const analise = analises.get(eq.ativo);
            const selecionado = selectedAtivo === eq.ativo;
            const zebra = idx % 2 === 0 ? "bg-transparent" : "bg-slate-50/60 dark:bg-white/[0.03]";
            return (
              <tr
                key={eq.ativo}
                onClick={() => onSelect(eq.ativo)}
                className={`group cursor-pointer transition ${zebra} ${
                  selecionado
                    ? "bg-orange-50/90 ring-1 ring-inset ring-orange-300/60 dark:bg-orange-950/25 dark:ring-orange-700/50"
                    : "hover:bg-orange-50/40 dark:hover:bg-orange-950/15"
                }`}
              >
                <td className={tdCls}>
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${nivelDotClass(analise?.nivel ?? "ok")}`}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 dark:text-white">{eq.ativo}</p>
                      <p className="truncate text-xs text-slate-500">{eq.nome ?? "—"}</p>
                      {eq.empresa ? (
                        <p className="truncate text-[10px] text-slate-400">{eq.empresa}</p>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className={tdCls}>
                  <div className="flex max-w-[160px] flex-wrap gap-1">
                    {analise?.badges.length ? (
                      analise.badges.slice(0, 2).map((b) => (
                        <span
                          key={b.key}
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeClasses(b.severidade)}`}
                        >
                          {b.label}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Normal</span>
                    )}
                    {(analise?.badges.length ?? 0) > 2 ? (
                      <span className="text-[10px] text-slate-400">+{(analise?.badges.length ?? 0) - 2}</span>
                    ) : null}
                  </div>
                </td>
                <td className={tdCls}>
                  <ConsumoMedioMetaBar
                    media={eq.media_litros_por_unidade}
                    meta={analise?.meta ?? null}
                    unidade={eq.unidade}
                    compact
                  />
                  {analise?.metaOrigem === "equipamento" ? (
                    <p className="mt-1 text-[10px] font-medium text-orange-600 dark:text-orange-400">Meta individual</p>
                  ) : null}
                </td>
                {compararPeriodo ? (
                  <td className={tdCls}>
                    <VariacaoBadge pct={analise?.variacaoPeriodo ?? null} />
                  </td>
                ) : null}
                <td className={`${tdCls} tabular-nums font-medium`}>{fmtLitrosDashboard(eq.total_litros_periodo)} L</td>
                <td className={`${tdCls} tabular-nums`}>{fmtUnidade(eq.total_unidade, eq.unidade)}</td>
                <td className={`${tdCls} tabular-nums`}>{eq.trechos_count}</td>
                <td className={`${tdCls} whitespace-nowrap text-xs`}>{fmtDataBr(eq.ultimo_abastecimento)}</td>
                <td className={tdCls}>
                  <ChevronRight
                    className={`h-4 w-4 text-slate-300 transition group-hover:text-orange-500 ${selecionado ? "text-orange-500" : ""}`}
                    aria-hidden
                  />
                </td>
              </tr>
            );
          })}
          {equipamentos.length === 0 && !loading ? (
            <tr>
              <td
                colSpan={compararPeriodo ? 9 : 8}
                className="px-4 py-16 text-center text-sm text-slate-500 dark:text-slate-400"
              >
                Nenhum equipamento encontrado com os filtros atuais.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
