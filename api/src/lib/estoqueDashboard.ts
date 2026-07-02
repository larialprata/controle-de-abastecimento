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
  tanques_obra: EstoqueTanqueObraItem[];
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
  const tanques_obra = await buildTanquesObraEstoque(service, { obraCodigo });

  return {
    obra_codigo: obraCodigo,
    tanque_total: {
      saldo_litros: Math.max(0, totalEntrada - retiradaEfetiva),
      total_entrada: totalEntrada,
      total_retirada: totalRetirada,
      total_devolvido: totalDevolvido,
    },
    tanques_por_combustivel,
    tanques_obra,
    melosas,
  };
}

async function buildTanquesObraEstoque(
  service: SupabaseClient,
  params: { obraCodigo?: number | null },
): Promise<EstoqueTanqueObraItem[]> {
  let movQuery = service
    .from("movimentacoes")
    .select(
      "tipo, obra_codigo, tanque_numero, litros, tanque_quantidade_abastecida, medidor_tanque_numero_inicial, medidor_tanque_numero_final",
    )
    .in("tipo", ["ENTRADA_TANQUE_OBRA", "RETIRADA_TANQUE"]);

  if (params.obraCodigo != null) {
    movQuery = movQuery.eq("obra_codigo", params.obraCodigo);
  }

  const [{ data: equipamentos }, { data: obrasData }, { data: movRows }] = await Promise.all([
    (() => {
      let eqQuery = service
        .from("equipamentos")
        .select("ativo, nome, obra_codigo, tanque_numero, capacidade_litros")
        .eq("tipo", "TANQUE")
        .order("obra_codigo")
        .order("tanque_numero");
      if (params.obraCodigo != null) {
        eqQuery = eqQuery.eq("obra_codigo", params.obraCodigo);
      }
      return eqQuery;
    })(),
    service.from("obras").select("codigo, nome"),
    movQuery,
  ]);

  const movs = (movRows ?? []) as Record<string, unknown>[];

  const obrasPorCodigo = new Map(
    (obrasData ?? []).map((o) => [Number(o.codigo), String(o.nome ?? "")]),
  );

  const saldoPorChave = new Map<string, number>();
  movs.forEach((m) => {
    const obra = Number(m.obra_codigo);
    const num = Number(m.tanque_numero);
    if (!Number.isFinite(obra) || !Number.isFinite(num) || num <= 0) return;
    const key = `${obra}-${num}`;
    const tipo = String(m.tipo ?? "");
    if (tipo === "ENTRADA_TANQUE_OBRA") {
      const litros = toNum(m.litros);
      if (litros > 0) saldoPorChave.set(key, (saldoPorChave.get(key) ?? 0) + litros);
    } else if (tipo === "RETIRADA_TANQUE") {
      const litros = litrosRetiradaTanque(m);
      if (litros > 0) saldoPorChave.set(key, (saldoPorChave.get(key) ?? 0) - litros);
    }
  });

  return (equipamentos ?? [])
    .map((eq) => {
      const obraCodigo = Number(eq.obra_codigo);
      const tanqueNumero = Number(eq.tanque_numero);
      const capacidade = toNum(eq.capacidade_litros);
      if (!Number.isFinite(obraCodigo) || !Number.isFinite(tanqueNumero) || tanqueNumero <= 0) {
        return null;
      }
      const cap = capacidade > 0 ? capacidade : 10_000;
      const saldo = Math.max(0, saldoPorChave.get(`${obraCodigo}-${tanqueNumero}`) ?? 0);
      const ocupacao = cap > 0 ? (saldo / cap) * 100 : 0;
      const pontoPedido = cap * 0.4;
      return {
        ativo: String(eq.ativo),
        nome: eq.nome != null ? String(eq.nome) : null,
        obra_codigo: obraCodigo,
        obra_nome: obrasPorCodigo.get(obraCodigo) ?? null,
        tanque_numero: tanqueNumero,
        capacidade_litros: cap,
        saldo_litros: saldo,
        ocupacao_pct: Math.min(100, Math.max(0, ocupacao)),
        ponto_pedido_litros: pontoPedido,
        abaixo_ponto_pedido: saldo < pontoPedido,
      } satisfies EstoqueTanqueObraItem;
    })
    .filter((item): item is EstoqueTanqueObraItem => item != null);
}

async function buildMelosasEstoque(
  service: SupabaseClient,
  params: { obraCodigo?: number | null; obraScope?: number[] | null },
): Promise<EstoqueMelosaItem[]> {
  let eqQuery = service
    .from("equipamentos")
    .select("ativo, capacidade_litros, obra_codigo")
    .eq("tipo", "MELOSA")
    .order("ativo");

  if (params.obraCodigo != null) {
    eqQuery = eqQuery.eq("obra_codigo", params.obraCodigo);
  } else if (params.obraScope?.length) {
    eqQuery = eqQuery.in("obra_codigo", params.obraScope);
  }

  const { data: equipamentos } = await eqQuery;

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

    if (ciclo) {
      const m = metricas.get(ciclo.id);
      if (m) {
        saldo = m.litros_sobra_atual;
      } else {
        const sobraAnt = toNum(ciclo.litros_sobra_anterior);
        const abast = toNum(ciclo.litros_abastecidos);
        saldo = calcularSobraAposAbastecimentos(litrosDisponivelNoCiclo({ ...ciclo, litros_sobra_anterior: sobraAnt }), abast);
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

  (equipamentos ?? []).forEach((eq) => {
    const ativo = normPlaca(eq.ativo);
    const cap = eq.capacidade_litros != null ? toNum(eq.capacidade_litros) : null;
    pushMelosa(ativo, cap && cap > 0 ? cap : null, eq.obra_codigo != null ? Number(eq.obra_codigo) : null, ultimoCicloPorAtivo.get(ativo));
  });

  ultimoCicloPorAtivo.forEach((ciclo, ativo) => {
    if (ativosVistos.has(ativo)) return;
    const cap = ciclo.capacidade_litros != null ? toNum(ciclo.capacidade_litros) : null;
    pushMelosa(ativo, cap && cap > 0 ? cap : null, ciclo.obra_codigo, ciclo);
  });

  return resultado.sort((a, b) => a.ativo.localeCompare(b.ativo));
}
