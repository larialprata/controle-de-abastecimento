import type { SupabaseClient } from "@supabase/supabase-js";
import { parseMedidorNumero } from "./melosaMedidorContinuidade";
import {
  enriquecerCiclosParaListagem,
  litrosDisponivelNoCiclo,
  calcularSobraAposAbastecimentos,
  type MelosaCicloRow,
} from "./melosaCiclo";

export type EstoqueProdutoKey = "DIESEL_S10" | "DIESEL_S500" | "ARLA_32" | "OUTROS";

export type EstoqueTanqueItem = {
  combustivel_key: EstoqueProdutoKey;
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

const PRODUTOS_PADRAO: Array<{
  key: EstoqueProdutoKey;
  label: string;
  cor: string;
  capacidade_litros: number;
  ponto_pedido_litros: number;
  aliases: string[];
}> = [
  {
    key: "DIESEL_S10",
    label: "Diesel S10",
    cor: "#EAB308",
    capacidade_litros: 10_000,
    ponto_pedido_litros: 4_000,
    aliases: ["DIESEL_S10", "DIESEL S10", "S10", "DIESEL"],
  },
  {
    key: "DIESEL_S500",
    label: "Diesel S500",
    cor: "#DC2626",
    capacidade_litros: 10_000,
    ponto_pedido_litros: 4_000,
    aliases: ["DIESEL_S500", "DIESEL S500", "S500"],
  },
  {
    key: "ARLA_32",
    label: "Arla 32",
    cor: "#2563EB",
    capacidade_litros: 1_000,
    ponto_pedido_litros: 400,
    aliases: ["ARLA_32", "ARLA 32", "ARLA", "ARLA32"],
  },
];

function toNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function normPlaca(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toUpperCase();
}

function normalizeCombustivelKey(raw: unknown): EstoqueProdutoKey {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
  if (!s) return "OUTROS";
  for (const p of PRODUTOS_PADRAO) {
    if (p.aliases.some((a) => a.toUpperCase() === s.replace(/ /g, "_") || a.toUpperCase() === s)) {
      return p.key;
    }
  }
  if (s.includes("S500")) return "DIESEL_S500";
  if (s.includes("S10") || s === "DIESEL") return "DIESEL_S10";
  if (s.includes("ARLA")) return "ARLA_32";
  return "OUTROS";
}

function litrosRetiradaTanque(row: Record<string, unknown>): number {
  const fromQuantidade = parseMedidorNumero(row.tanque_quantidade_abastecida as string | null);
  if (fromQuantidade != null && fromQuantidade > 0) return fromQuantidade;
  const ini = parseMedidorNumero(row.medidor_tanque_numero_inicial as string | null);
  const fin = parseMedidorNumero(row.medidor_tanque_numero_final as string | null);
  if (ini != null && fin != null && fin > ini) return fin - ini;
  return toNum(row.litros);
}

function placaMelosa(row: Record<string, unknown>): string {
  return normPlaca(row.ativo_melosa_texto ?? row.placa_texto ?? row.placa_caminhao);
}

export async function buildEstoqueDashboard(
  service: SupabaseClient,
  params: {
    obraCodigo?: number | null;
    obraScope?: number[] | null;
  },
): Promise<EstoqueDashboardResposta> {
  const obraCodigo = params.obraCodigo ?? null;

  let movQuery = service
    .from("movimentacoes")
    .select("*")
    .in("tipo", ["ENTRADA_TANQUE_OBRA", "RETIRADA_TANQUE"])
    .order("data_hora", { ascending: true });

  if (obraCodigo != null) {
    movQuery = movQuery.eq("obra_codigo", obraCodigo);
  } else if (params.obraScope?.length) {
    movQuery = movQuery.in("obra_codigo", params.obraScope);
  }

  const { data: movRows } = await movQuery;
  const movs = (movRows ?? []) as Record<string, unknown>[];

  const placasRetirada = new Set<string>();
  movs.forEach((m) => {
    if (String(m.tipo) !== "RETIRADA_TANQUE") return;
    const placa = placaMelosa(m);
    if (placa) placasRetirada.add(placa);
  });

  const entradasPorTipo = new Map<EstoqueProdutoKey, number>();
  let totalEntrada = 0;
  let totalRetirada = 0;
  let totalDevolvido = 0;

  movs.forEach((m) => {
    const tipo = String(m.tipo ?? "");
    if (tipo === "ENTRADA_TANQUE_OBRA") {
      const litros = toNum(m.litros);
      if (litros <= 0) return;
      const placa = placaMelosa(m);
      if (placa && placasRetirada.has(placa)) {
        totalDevolvido += litros;
        return;
      }
      const key = normalizeCombustivelKey(m.combustivel_tipo);
      entradasPorTipo.set(key, (entradasPorTipo.get(key) ?? 0) + litros);
      totalEntrada += litros;
      return;
    }
    if (tipo === "RETIRADA_TANQUE") {
      const litros = litrosRetiradaTanque(m);
      if (litros > 0) totalRetirada += litros;
    }
  });

  const retiradaEfetiva = Math.max(0, totalRetirada - totalDevolvido);
  const saldosPorTipo = new Map<EstoqueProdutoKey, number>();

  PRODUTOS_PADRAO.forEach((p) => saldosPorTipo.set(p.key, 0));
  saldosPorTipo.set("OUTROS", 0);

  if (totalEntrada > 0 && retiradaEfetiva > 0) {
    entradasPorTipo.forEach((entrada, key) => {
      const alocado = (entrada / totalEntrada) * retiradaEfetiva;
      saldosPorTipo.set(key, Math.max(0, entrada - alocado));
    });
  } else {
    entradasPorTipo.forEach((entrada, key) => {
      saldosPorTipo.set(key, entrada);
    });
  }

  const tanques_por_combustivel: EstoqueTanqueItem[] = PRODUTOS_PADRAO.map((prod) => {
    const saldo = saldosPorTipo.get(prod.key) ?? 0;
    const entrada = entradasPorTipo.get(prod.key) ?? 0;
    const alocada = Math.max(0, entrada - saldo);
    const ocupacao = prod.capacidade_litros > 0 ? (saldo / prod.capacidade_litros) * 100 : 0;
    return {
      combustivel_key: prod.key,
      label: prod.label,
      cor: prod.cor,
      saldo_litros: saldo,
      capacidade_litros: prod.capacidade_litros,
      ocupacao_pct: Math.min(100, Math.max(0, ocupacao)),
      ponto_pedido_litros: prod.ponto_pedido_litros,
      abaixo_ponto_pedido: saldo < prod.ponto_pedido_litros,
      total_entrada: entrada,
      total_retirada_alocada: alocada,
    };
  });

  const outrosSaldo = saldosPorTipo.get("OUTROS") ?? 0;
  if (outrosSaldo > 0.05 || (entradasPorTipo.get("OUTROS") ?? 0) > 0) {
    const entrada = entradasPorTipo.get("OUTROS") ?? 0;
    const capacidade = Math.max(entrada, outrosSaldo, 1_000);
    tanques_por_combustivel.push({
      combustivel_key: "OUTROS",
      label: "Outros",
      cor: "#64748B",
      saldo_litros: outrosSaldo,
      capacidade_litros: capacidade,
      ocupacao_pct: Math.min(100, (outrosSaldo / capacidade) * 100),
      ponto_pedido_litros: capacidade * 0.4,
      abaixo_ponto_pedido: outrosSaldo < capacidade * 0.4,
      total_entrada: entrada,
      total_retirada_alocada: Math.max(0, entrada - outrosSaldo),
    });
  }

  const melosas = await buildMelosasEstoque(service, { obraCodigo, obraScope: params.obraScope });
  const tanques_registrados = await buildTanquesRegistrados(service, movs, {
    obraCodigo,
    obraScope: params.obraScope,
  });

  return {
    obra_codigo: obraCodigo,
    tanque_total: {
      saldo_litros: Math.max(0, totalEntrada - retiradaEfetiva),
      total_entrada: totalEntrada,
      total_retirada: totalRetirada,
      total_devolvido: totalDevolvido,
    },
    tanques_por_combustivel,
    tanques_registrados,
    melosas,
  };
}

function tanqueRegistradoKey(obraCodigo: number, tanqueNumero: number): string {
  return `${obraCodigo}:${tanqueNumero}`;
}

function parseDataHoraMov(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Início de 06/07/2026 (BRT) para tanques com saldo cadastrado antes de saldo_inicial_em existir. */
const SALDO_INICIAL_CUTOFF_PADRAO = new Date("2026-07-06T03:00:00.000Z");

async function buildTanquesRegistrados(
  service: SupabaseClient,
  movs: Record<string, unknown>[],
  params: { obraCodigo?: number | null; obraScope?: number[] | null },
): Promise<EstoqueTanqueRegistradoItem[]> {
  let eqQuery = service
    .from("equipamentos")
    .select("ativo, nome, obra_codigo, tanque_numero, capacidade_litros, saldo_inicial_litros, saldo_inicial_em")
    .eq("tipo", "TANQUE")
    .order("obra_codigo")
    .order("tanque_numero");

  if (params.obraCodigo != null) {
    eqQuery = eqQuery.eq("obra_codigo", params.obraCodigo);
  } else if (params.obraScope?.length) {
    eqQuery = eqQuery.in("obra_codigo", params.obraScope);
  }

  const { data: equipamentos } = await eqQuery;
  const rows = equipamentos ?? [];
  if (rows.length === 0) return [];

  const obraCodigos = Array.from(
    new Set(rows.map((eq) => Number(eq.obra_codigo)).filter((c) => Number.isFinite(c))),
  );
  const obraNomes = new Map<number, string>();
  if (obraCodigos.length > 0) {
    const { data: obras } = await service.from("obras").select("codigo, nome").in("codigo", obraCodigos);
    (obras ?? []).forEach((o) => {
      if (o.codigo != null) obraNomes.set(Number(o.codigo), String(o.nome ?? ""));
    });
  }

  const cutoffPorTanque = new Map<string, Date>();
  rows.forEach((eq) => {
    const obra = Number(eq.obra_codigo);
    const tanque = Number(eq.tanque_numero);
    if (!Number.isFinite(obra) || !Number.isFinite(tanque) || tanque <= 0) return;
    const hasSaldo =
      eq.saldo_inicial_litros != null && Number.isFinite(toNum(eq.saldo_inicial_litros));
    if (!hasSaldo) return;
    const em = parseDataHoraMov(eq.saldo_inicial_em);
    cutoffPorTanque.set(tanqueRegistradoKey(obra, tanque), em ?? SALDO_INICIAL_CUTOFF_PADRAO);
  });

  const saldos = new Map<string, { entrada: number; retirada: number }>();
  movs.forEach((m) => {
    const obra = Number(m.obra_codigo);
    const tanque = Number(m.tanque_numero);
    if (!Number.isFinite(obra) || !Number.isFinite(tanque) || tanque <= 0) return;
    const key = tanqueRegistradoKey(obra, tanque);
    const cutoff = cutoffPorTanque.get(key);
    if (cutoff) {
      const dataHora = parseDataHoraMov(m.data_hora);
      if (!dataHora || dataHora < cutoff) return;
    }
    if (!saldos.has(key)) saldos.set(key, { entrada: 0, retirada: 0 });
    const bucket = saldos.get(key)!;
    const tipo = String(m.tipo ?? "");
    if (tipo === "ENTRADA_TANQUE_OBRA") {
      const litros = toNum(m.litros);
      if (litros > 0) bucket.entrada += litros;
    } else if (tipo === "RETIRADA_TANQUE") {
      const litros = litrosRetiradaTanque(m);
      if (litros > 0) bucket.retirada += litros;
    }
  });

  const DEFAULT_CAP = 10_000;

  return rows
    .map((eq) => {
      const obra = Number(eq.obra_codigo);
      const tanque = Number(eq.tanque_numero);
      if (!Number.isFinite(obra) || !Number.isFinite(tanque) || tanque <= 0) return null;

      const { entrada = 0, retirada = 0 } = saldos.get(tanqueRegistradoKey(obra, tanque)) ?? {};
      const saldoInicial =
        eq.saldo_inicial_litros != null && Number.isFinite(toNum(eq.saldo_inicial_litros))
          ? toNum(eq.saldo_inicial_litros)
          : 0;
      const saldo = Math.max(0, saldoInicial + entrada - retirada);
      const cap =
        eq.capacidade_litros != null && toNum(eq.capacidade_litros) > 0
          ? toNum(eq.capacidade_litros)
          : DEFAULT_CAP;
      const ponto = cap * 0.4;
      const ocupacao = cap > 0 ? (saldo / cap) * 100 : 0;
      const nome = typeof eq.nome === "string" ? eq.nome.trim() : "";
      const obraNome = obraNomes.get(obra) ?? null;

      return {
        ativo: String(eq.ativo ?? ""),
        nome: nome || null,
        obra_codigo: obra,
        obra_nome: obraNome,
        tanque_numero: tanque,
        label: nome ? `Tanque ${tanque} — ${nome}` : `Tanque ${tanque}`,
        saldo_litros: saldo,
        capacidade_litros: cap,
        ocupacao_pct: Math.min(100, Math.max(0, ocupacao)),
        ponto_pedido_litros: ponto,
        abaixo_ponto_pedido: saldo < ponto,
      };
    })
    .filter((item): item is EstoqueTanqueRegistradoItem => item != null);
}

async function buildMelosasEstoque(
  service: SupabaseClient,
  params: { obraCodigo?: number | null; obraScope?: number[] | null },
): Promise<EstoqueMelosaItem[]> {
  // Melosas são ativos globais (obra_codigo null) — não filtrar o cadastro por obra.
  const { data: equipamentos } = await service
    .from("equipamentos")
    .select("ativo, capacidade_litros, obra_codigo, saldo_inicial_litros, saldo_inicial_em")
    .eq("tipo", "MELOSA")
    .order("ativo");

  let cicloQuery = service.from("melosa_ciclos").select("*").order("ciclo_numero", { ascending: false });
  if (params.obraCodigo != null) {
    cicloQuery = cicloQuery.eq("obra_codigo", params.obraCodigo);
  } else if (params.obraScope?.length) {
    cicloQuery = cicloQuery.in("obra_codigo", params.obraScope);
  }

  const { data: ciclosData } = await cicloQuery.limit(500);
  const ciclos = (ciclosData ?? []) as MelosaCicloRow[];
  const metricas = await enriquecerCiclosParaListagem(service, ciclos);

  const ultimoCicloPorAtivo = new Map<string, MelosaCicloRow>();
  ciclos.forEach((c) => {
    const ativo = normPlaca(c.ativo_melosa_texto);
    if (!ultimoCicloPorAtivo.has(ativo)) ultimoCicloPorAtivo.set(ativo, c);
  });

  type MelosaEq = {
    ativo: string;
    capacidade_litros: unknown;
    obra_codigo: number | null;
    saldo_inicial_litros: unknown;
    saldo_inicial_em: unknown;
  };

  const eqPorAtivo = new Map<string, MelosaEq>();
  (equipamentos ?? []).forEach((eq) => {
    const ativo = normPlaca(eq.ativo);
    if (ativo) eqPorAtivo.set(ativo, eq as MelosaEq);
  });

  const cutoffPorAtivo = new Map<string, Date>();
  const saldoInicialPorAtivo = new Map<string, number>();
  eqPorAtivo.forEach((eq, ativo) => {
    if (eq.saldo_inicial_litros == null || !Number.isFinite(toNum(eq.saldo_inicial_litros))) return;
    saldoInicialPorAtivo.set(ativo, Math.max(0, toNum(eq.saldo_inicial_litros)));
    const em = parseDataHoraMov(eq.saldo_inicial_em);
    cutoffPorAtivo.set(ativo, em ?? SALDO_INICIAL_CUTOFF_PADRAO);
  });

  const enchimentosApos = new Map<string, number>();
  ciclos.forEach((c) => {
    const ativo = normPlaca(c.ativo_melosa_texto);
    const cutoff = cutoffPorAtivo.get(ativo);
    if (!cutoff) return;
    const dh = parseDataHoraMov(c.data_hora);
    if (!dh || dh.getTime() <= cutoff.getTime()) return;
    enchimentosApos.set(ativo, (enchimentosApos.get(ativo) ?? 0) + toNum(c.litros_retirada));
  });

  const abastApos = new Map<string, number>();
  if (saldoInicialPorAtivo.size > 0) {
    const ativosComSaldo = Array.from(saldoInicialPorAtivo.keys());
    const cutoffs = Array.from(cutoffPorAtivo.values());
    const minCutoff = cutoffs.reduce((min, d) => (d.getTime() < min.getTime() ? d : min), cutoffs[0]!);
    const { data: movMelosa } = await service
      .from("melosa_movimentacoes")
      .select("ativo_melosa_texto, litros, data_hora")
      .in("ativo_melosa_texto", ativosComSaldo)
      .gt("data_hora", minCutoff.toISOString())
      .order("data_hora", { ascending: true });

    (movMelosa ?? []).forEach((row) => {
      const ativo = normPlaca(row.ativo_melosa_texto);
      const cutoff = cutoffPorAtivo.get(ativo);
      if (!cutoff) return;
      const dh = parseDataHoraMov(row.data_hora);
      if (!dh || dh.getTime() <= cutoff.getTime()) return;
      abastApos.set(ativo, (abastApos.get(ativo) ?? 0) + toNum(row.litros));
    });
  }

  const ativosVistos = new Set<string>();
  const resultado: EstoqueMelosaItem[] = [];

  const pushMelosa = (
    ativo: string,
    capacidade: number | null,
    obraCodigo: number | null,
    ciclo: MelosaCicloRow | undefined,
  ) => {
    const key = normPlaca(ativo);
    if (!key || ativosVistos.has(key)) return;
    ativosVistos.add(key);

    let saldo = 0;
    let cicloNumero: number | null = null;

    const saldoInicial = saldoInicialPorAtivo.get(key);
    if (saldoInicial != null) {
      saldo = Math.max(
        0,
        saldoInicial + (enchimentosApos.get(key) ?? 0) - (abastApos.get(key) ?? 0),
      );
      if (ciclo) cicloNumero = ciclo.ciclo_numero;
    } else if (ciclo) {
      const m = metricas.get(ciclo.id);
      if (m) {
        saldo = m.litros_sobra_atual;
      } else {
        const sobraAnt = toNum(ciclo.litros_sobra_anterior);
        const abast = toNum(ciclo.litros_abastecidos);
        saldo = calcularSobraAposAbastecimentos(
          litrosDisponivelNoCiclo({ ...ciclo, litros_sobra_anterior: sobraAnt }),
          abast,
        );
      }
      cicloNumero = ciclo.ciclo_numero;
    }

    const ocupacao = capacidade != null && capacidade > 0 ? (saldo / capacidade) * 100 : null;
    const pontoPedido = capacidade != null && capacidade > 0 ? capacidade * 0.2 : null;

    resultado.push({
      ativo: key,
      saldo_litros: saldo,
      capacidade_litros: capacidade,
      ocupacao_pct: ocupacao != null ? Math.min(100, Math.max(0, ocupacao)) : null,
      ponto_pedido_litros: pontoPedido,
      abaixo_ponto_pedido: pontoPedido != null ? saldo < pontoPedido : false,
      ultimo_ciclo_numero: cicloNumero,
      obra_codigo: obraCodigo,
    });
  };

  eqPorAtivo.forEach((eq, ativo) => {
    const cap = eq.capacidade_litros != null ? toNum(eq.capacidade_litros) : null;
    pushMelosa(
      ativo,
      cap && cap > 0 ? cap : null,
      eq.obra_codigo != null ? Number(eq.obra_codigo) : null,
      ultimoCicloPorAtivo.get(ativo),
    );
  });

  ultimoCicloPorAtivo.forEach((ciclo, ativo) => {
    if (ativosVistos.has(ativo)) return;
    const cap = ciclo.capacidade_litros != null ? toNum(ciclo.capacidade_litros) : null;
    pushMelosa(ativo, cap && cap > 0 ? cap : null, ciclo.obra_codigo, ciclo);
  });

  return resultado.sort((a, b) => a.ativo.localeCompare(b.ativo));
}
