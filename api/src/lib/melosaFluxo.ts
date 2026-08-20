import type { SupabaseClient } from "@supabase/supabase-js";
import { parseMedidorNumero } from "./melosaMedidorContinuidade";

export type FluxoEventoTipo =
  | "entrada_tanque"
  | "enchimento_melosa"
  | "abastecimento_equip"
  | "registro_inesperado";

export type FluxoEvento = {
  id: string;
  tipo: FluxoEventoTipo;
  data_hora: string;
  litros: number;
  titulo: string;
  subtitulo: string;
  equipamento: string | null;
  ciclo_numero: number | null;
  saldo_tanque: number;
  saldo_melosa: number;
  capacidade_melosa: number | null;
  alertas: string[];
};

export type FluxoDiaResumo = {
  data: string;
  abastecimentos_count: number;
  litros_abastecidos: number;
  saldo_melosa_fim_dia: number;
  saldo_tanque_fim_dia: number;
};

export type MelosaFluxoResposta = {
  ativo_melosa: string;
  capacidade_litros: number | null;
  obra_codigo: number | null;
  eventos: FluxoEvento[];
  resumo: {
    saldo_tanque_atual: number;
    saldo_melosa_atual: number;
    total_entrada_tanque: number;
    total_retirada_melosa: number;
    total_abastecimentos: number;
    registros_inesperados: number;
    alertas_count: number;
  };
  por_dia: FluxoDiaResumo[];
};

function normalizeAtivo(v: string): string {
  return v.trim().toUpperCase();
}

function toNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function placaFromTanqueRow(row: Record<string, unknown>): string {
  const p = String(row.ativo_melosa_texto ?? row.placa_texto ?? row.placa_caminhao ?? "")
    .trim()
    .toUpperCase();
  return p;
}

function litrosRetiradaTanque(row: Record<string, unknown>): number {
  const fromQuantidade = parseMedidorNumero(row.tanque_quantidade_abastecida as string | null);
  if (fromQuantidade != null && fromQuantidade > 0) return fromQuantidade;
  const ini = parseMedidorNumero(row.medidor_tanque_numero_inicial as string | null);
  const fin = parseMedidorNumero(row.medidor_tanque_numero_final as string | null);
  if (ini != null && fin != null && fin > ini) return fin - ini;
  return toNum(row.litros);
}

function litrosMelosaRow(row: Record<string, unknown>): number {
  const fromQuantidade = parseMedidorNumero(row.melosa_quantidade_abastecida as string | null);
  if (fromQuantidade != null && fromQuantidade > 0) return fromQuantidade;
  return toNum(row.litros);
}

function fmtLitros(v: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v);
}

function fmtDataBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function fmtDataDia(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

type RawEvento = {
  id: string;
  tipo: FluxoEventoTipo;
  data_hora: string;
  litros: number;
  titulo: string;
  subtitulo: string;
  equipamento: string | null;
  ciclo_numero: number | null;
};

async function findCapacidadeMelosa(service: SupabaseClient, ativo: string): Promise<number | null> {
  const { data } = await service
    .from("equipamentos")
    .select("capacidade_litros, ativo, tipo")
    .eq("tipo", "MELOSA");
  if (!data?.length) return null;
  const row = data.find((r) => normalizeAtivo(String(r.ativo ?? "")) === ativo);
  if (!row) return null;
  const cap = toNum(row.capacidade_litros);
  return cap > 0 ? cap : null;
}

function buildPorDia(eventos: FluxoEvento[]): FluxoDiaResumo[] {
  const map = new Map<string, FluxoDiaResumo>();
  eventos.forEach((ev) => {
    const data = fmtDataDia(ev.data_hora);
    const cur = map.get(data) ?? {
      data,
      abastecimentos_count: 0,
      litros_abastecidos: 0,
      saldo_melosa_fim_dia: ev.saldo_melosa,
      saldo_tanque_fim_dia: ev.saldo_tanque,
    };
    if (ev.tipo === "abastecimento_equip") {
      cur.abastecimentos_count += 1;
      cur.litros_abastecidos += ev.litros;
    }
    cur.saldo_melosa_fim_dia = ev.saldo_melosa;
    cur.saldo_tanque_fim_dia = ev.saldo_tanque;
    map.set(data, cur);
  });
  return Array.from(map.values()).sort((a, b) => {
    const pa = a.data.split("/").reverse().join("-");
    const pb = b.data.split("/").reverse().join("-");
    return pa.localeCompare(pb);
  });
}

function aplicarSaldos(
  raw: RawEvento[],
  capacidade: number | null,
): FluxoEvento[] {
  let saldoTanque = 0;
  let saldoMelosa = 0;
  const out: FluxoEvento[] = [];

  raw.forEach((ev) => {
    const alertas: string[] = [];

    if (ev.tipo === "entrada_tanque") {
      saldoTanque += ev.litros;
    } else if (ev.tipo === "registro_inesperado") {
      alertas.push(
        "A melosa não devolve combustível ao tanque — este registro foi ignorado no saldo e precisa de revisão.",
      );
    } else if (ev.tipo === "enchimento_melosa") {
      const saldoAntes = saldoMelosa;
      const totalApos = saldoAntes + ev.litros;
      saldoTanque = Math.max(0, saldoTanque - ev.litros);
      saldoMelosa = totalApos;
      ev.subtitulo = `${fmtLitros(ev.litros)} L do tanque → melosa · saldo estimado: ${fmtLitros(saldoAntes)} → ${fmtLitros(totalApos)} L`;

      if (capacidade != null && capacidade > 0 && totalApos > capacidade + 0.05) {
        const excedente = totalApos - capacidade;
        alertas.push(
          `Capacidade ultrapassada: ${fmtLitros(saldoAntes)} L na melosa + ${fmtLitros(ev.litros)} L do tanque = ${fmtLitros(totalApos)} L, mas o máximo é ${fmtLitros(capacidade)} L → ${fmtLitros(excedente)} L não cabem na melosa (volume sem explicação nos registros).`,
        );
      }
    } else if (ev.tipo === "abastecimento_equip") {
      const saldoAntes = saldoMelosa;
      if (ev.litros > saldoAntes + 0.05) {
        alertas.push(
          `Abastecimento (${fmtLitros(ev.litros)} L) maior que o saldo estimado na melosa (${fmtLitros(saldoAntes)} L).`,
        );
      }
      saldoMelosa = Math.max(0, saldoMelosa - ev.litros);
      const equipLabel = ev.equipamento ?? "equipamento";
      ev.subtitulo = `${fmtLitros(ev.litros)} L para ${equipLabel} · melosa: ${fmtLitros(saldoAntes)} → ${fmtLitros(saldoMelosa)} L`;
    }

    out.push({
      ...ev,
      saldo_tanque: saldoTanque,
      saldo_melosa: saldoMelosa,
      capacidade_melosa: capacidade,
      alertas,
    });
  });

  return out;
}

export async function buildMelosaFluxo(
  service: SupabaseClient,
  params: {
    ativoMelosa: string;
    obraCodigo?: number | null;
    obraScope?: number[] | null;
    limit?: number;
  },
): Promise<MelosaFluxoResposta> {
  const ativo = normalizeAtivo(params.ativoMelosa);
  if (!ativo) throw new Error("Informe o ativo da melosa.");

  const capacidade = await findCapacidadeMelosa(service, ativo);

  const { data: ciclosData } = await service
    .from("melosa_ciclos")
    .select("ciclo_numero, retirada_operation_id, obra_codigo, data_hora, litros_retirada")
    .ilike("ativo_melosa_texto", ativo)
    .order("data_hora", { ascending: true });

  const cicloPorRetirada = new Map<string, number>();
  const obrasMelosa = new Set<number>();
  (ciclosData ?? []).forEach((c) => {
    cicloPorRetirada.set(String(c.retirada_operation_id), Number(c.ciclo_numero));
    if (c.obra_codigo != null) obrasMelosa.add(Number(c.obra_codigo));
  });

  let obraCodigo = params.obraCodigo ?? null;
  if (obraCodigo == null && ciclosData?.length) {
    obraCodigo = Number((ciclosData[ciclosData.length - 1] as { obra_codigo: number | null }).obra_codigo);
  }

  const rawEventos: RawEvento[] = [];

  if (obraCodigo != null) {
    obrasMelosa.add(obraCodigo);
  }

  const obrasList = Array.from(obrasMelosa).filter((o) => {
    if (!params.obraScope?.length) return true;
    return params.obraScope.includes(o);
  });

  if (obrasList.length > 0) {
    const { data: tanqueRows } = await service
      .from("movimentacoes")
      .select("*")
      .in("obra_codigo", obrasList)
      .in("tipo", ["ENTRADA_TANQUE_OBRA", "RETIRADA_TANQUE"])
      .order("data_hora", { ascending: true });
    (tanqueRows ?? []).forEach((row) => {
      const r = row as Record<string, unknown>;
      const tipo = String(r.tipo ?? "");
      const dataHora = String(r.data_hora ?? "");
      const placa = placaFromTanqueRow(r);
      const opId = String(r.operation_id ?? r.id ?? "");

      if (tipo === "ENTRADA_TANQUE_OBRA") {
        const litros = toNum(r.litros);
        if (litros <= 0) return;
        if (placa === ativo) {
          rawEventos.push({
            id: `anom-${opId}`,
            tipo: "registro_inesperado",
            data_hora: dataHora,
            litros,
            titulo: "Registro inesperado",
            subtitulo: `Entrada no tanque com placa da melosa ${ativo} (${fmtLitros(litros)} L) — a melosa não devolve ao tanque`,
            equipamento: null,
            ciclo_numero: null,
          });
        } else {
          rawEventos.push({
            id: `ent-${opId}`,
            tipo: "entrada_tanque",
            data_hora: dataHora,
            litros,
            titulo: "Entrada no tanque",
            subtitulo: `${fmtLitros(litros)} L abastecidos no tanque da obra`,
            equipamento: null,
            ciclo_numero: null,
          });
        }
        return;
      }

      if (tipo === "RETIRADA_TANQUE" && placa === ativo) {
        const litros = litrosRetiradaTanque(r);
        if (litros <= 0) return;
        const cicloNumero = cicloPorRetirada.get(opId) ?? null;
        rawEventos.push({
          id: `enc-${opId}`,
          tipo: "enchimento_melosa",
          data_hora: dataHora,
          litros,
          titulo: "Enchimento da melosa",
          subtitulo: `${fmtLitros(litros)} L retirados do tanque → melosa ${ativo}`,
          equipamento: null,
          ciclo_numero: cicloNumero,
        });
      }
    });
  }

  // Enchimentos sem RETIRADA_TANQUE (ex.: transferência melosa → melosa).
  const enchimentoIds = new Set(rawEventos.filter((e) => e.tipo === "enchimento_melosa").map((e) => e.id));
  (ciclosData ?? []).forEach((c) => {
    const opId = String(c.retirada_operation_id ?? "");
    if (!opId || enchimentoIds.has(`enc-${opId}`)) return;
    const litros = toNum(c.litros_retirada);
    if (litros <= 0) return;
    rawEventos.push({
      id: `enc-${opId}`,
      tipo: "enchimento_melosa",
      data_hora: String(c.data_hora ?? ""),
      litros,
      titulo: "Enchimento da melosa",
      subtitulo: `${fmtLitros(litros)} L recebidos (transferência / ajuste) → melosa ${ativo}`,
      equipamento: null,
      ciclo_numero: Number(c.ciclo_numero) || null,
    });
  });

  const { data: melosaRows } = await service
    .from("melosa_movimentacoes")
    .select("*")
    .ilike("ativo_melosa_texto", ativo)
    .order("data_hora", { ascending: true });

  (melosaRows ?? []).forEach((row) => {
    const r = row as Record<string, unknown>;
    const litros = litrosMelosaRow(r);
    if (litros <= 0) return;
    const dataHora = String(r.data_hora ?? "");
    const opId = String(r.operation_id ?? r.id ?? "");
    const equipamento = String(r.ativo_equipamento_texto ?? "").trim() || null;
    if (r.obra_codigo != null) obrasMelosa.add(Number(r.obra_codigo));

    const obs = String(r.obs ?? "");
    const isTransfer = obs.toUpperCase().includes("[TRANSFERENCIA_MELOSA]");
    rawEventos.push({
      id: `ab-${opId}`,
      tipo: "abastecimento_equip",
      data_hora: dataHora,
      litros,
      titulo: isTransfer ? "Transferência para outra melosa" : "Abastecimento de equipamento",
      subtitulo: isTransfer
        ? `${fmtLitros(litros)} L transferidos para ${equipamento ?? "melosa"} (saldo na melosa diminui)`
        : `${fmtLitros(litros)} L para ${equipamento ?? "equipamento"} (saldo na melosa diminui)`,
      equipamento,
      ciclo_numero: null,
    });
  });

  rawEventos.sort((a, b) => a.data_hora.localeCompare(b.data_hora));

  const limit = params.limit ?? 500;
  const limited = rawEventos.length > limit ? rawEventos.slice(-limit) : rawEventos;

  const eventos = aplicarSaldos(limited, capacidade);
  const alertasCount = eventos.filter((e) => e.alertas.length > 0).length;

  let totalEntrada = 0;
  let totalRetirada = 0;
  let totalAbast = 0;
  let registrosInesperados = 0;
  limited.forEach((e) => {
    if (e.tipo === "entrada_tanque") totalEntrada += e.litros;
    if (e.tipo === "enchimento_melosa") totalRetirada += e.litros;
    if (e.tipo === "abastecimento_equip") totalAbast += e.litros;
    if (e.tipo === "registro_inesperado") registrosInesperados += 1;
  });

  const ultimo = eventos[eventos.length - 1];

  return {
    ativo_melosa: ativo,
    capacidade_litros: capacidade,
    obra_codigo: obraCodigo,
    eventos,
    resumo: {
      saldo_tanque_atual: ultimo?.saldo_tanque ?? 0,
      saldo_melosa_atual: ultimo?.saldo_melosa ?? 0,
      total_entrada_tanque: totalEntrada,
      total_retirada_melosa: totalRetirada,
      total_abastecimentos: totalAbast,
      registros_inesperados: registrosInesperados,
      alertas_count: alertasCount,
    },
    por_dia: buildPorDia(eventos),
  };
}

export { fmtDataBr };
