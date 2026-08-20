import type { SupabaseClient } from "@supabase/supabase-js";
import { parseMedidorNumero } from "./melosaMedidorContinuidade";
import { fetchConsumoMetas, resolveMetaParaEquipamento, type ConsumoMeta } from "./consumoMetas";
import {
  fetchMetaEquipamento,
  fetchMetasEquipamento,
  metasEquipamentoToRecord,
  type MetaEquipamento,
} from "./consumoMetasEquipamento";

export type { ConsumoMeta, MetaEquipamento };

export type MelosaAbastecimentoRow = {
  operation_id?: string;
  data_hora?: string;
  ativo_melosa_texto?: string | null;
  ativo_equipamento_texto?: string | null;
  ativo_equipamento_nome?: string | null;
  ativo_equipamento_empresa?: string | null;
  melosa_horimetro_equipamento_abastecido_numero?: string | null;
  melosa_quantidade_abastecida?: string | null;
  melosa_motorista_equipamento_abastecido?: string | null;
  litros?: number | null;
  obra_codigo?: number | null;
};

export type ConsumoTrecho = {
  data_hora_inicio: string;
  data_hora_fim: string;
  horimetro_inicio: string;
  horimetro_fim: string;
  delta_unidade: number;
  litros: number;
  litros_por_unidade: number;
};

export type ConsumoEquipamento = {
  ativo: string;
  nome: string | null;
  empresa: string | null;
  mobilidade: string | null;
  unidade: string;
  abastecimentos_count: number;
  leituras_com_horimetro: number;
  trechos_count: number;
  total_litros_periodo: number;
  total_unidade: number;
  media_litros_por_unidade: number | null;
  ultimo_horimetro: string | null;
  ultimo_abastecimento: string | null;
  horimetro_regressivo_count: number;
  trechos: ConsumoTrecho[];
};

/** Agregação de consumo por motorista (texto livre do app). `ativo` = nome exibido. */
export type ConsumoMotorista = ConsumoEquipamento & {
  motorista_key: string;
  equipamentos_distintos: number;
};

export type SemHorimetroRow = {
  operation_id: string | null;
  data_hora: string;
  ativo: string;
  nome: string | null;
  horimetro_informado: string | null;
  litros: number;
};

export type PeriodoAnteriorResumo = {
  de: string;
  ate: string;
  por_ativo: Record<string, { media_litros_por_unidade: number | null; unidade: string }>;
};

export type EquipamentoConsumoResposta = {
  periodo: { de: string | null; ate: string | null };
  equipamentos: ConsumoEquipamento[];
  motoristas: ConsumoMotorista[];
  /** Litros abastecidos em equipamentos no período (exclui tanque/melosa). */
  total_litros_equipamentos: number;
  abastecimentos_equipamentos: number;
  sem_dados_horimetro: number;
  sem_horimetro_rows: SemHorimetroRow[];
  horimetro_regressivo_total: number;
  metas: ConsumoMeta[];
  metas_equipamento: Record<string, MetaEquipamento>;
  periodo_anterior: PeriodoAnteriorResumo | null;
};

export type ConsumoMesPoint = {
  mes: string;
  label: string;
  media_litros_por_unidade: number | null;
  total_litros: number;
  trechos_count: number;
};

export type EquipamentoConsumoDetalhe = {
  equipamento: ConsumoEquipamento;
  meta_equipamento: MetaEquipamento | null;
  meta_efetiva: number | null;
  serie_mensal: ConsumoMesPoint[];
  periodo: { de: string | null; ate: string | null };
};

export type EquipamentoConsumoFiltros = {
  de?: string | null;
  ate?: string | null;
  obraCodigo?: number | null;
  ativoEquipamento?: string | null;
  ativoMelosa?: string | null;
  compararPeriodoAnterior?: boolean;
};

function normAtivo(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toUpperCase();
}

const SEM_MOTORISTA_LABEL = "Sem motorista";

export function normalizeMotoristaKey(v: unknown): { key: string; label: string } {
  const label = String(v ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!label) return { key: "__SEM_MOTORISTA__", label: SEM_MOTORISTA_LABEL };
  return { key: label.toUpperCase(), label };
}

function parseDataHora(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function litrosFromRow(row: MelosaAbastecimentoRow): number {
  const fromQuantidade = parseMedidorNumero(row.melosa_quantidade_abastecida);
  if (fromQuantidade != null && fromQuantidade > 0) return fromQuantidade;
  if (typeof row.litros === "number" && Number.isFinite(row.litros) && row.litros > 0) return row.litros;
  return 0;
}

export function parseHorimetroNumero(v: unknown): { valor: number; unidade: string } | null {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === "quebrado" || lower === "inexistente") return null;
  const unidade = lower.includes("km") ? "km" : lower.includes("h") ? "h" : "h";
  const numMatch = raw.replace(/\s/g, "").replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!numMatch) return null;
  const valor = Number(numMatch[0]);
  if (!Number.isFinite(valor)) return null;
  return { valor, unidade };
}

export function calcPeriodoAnterior(de: string, ate: string): { de: string; ate: string } | null {
  const dDe = parseDataHora(`${de}T12:00:00`);
  const dAte = parseDataHora(`${ate}T12:00:00`);
  if (!dDe || !dAte || dAte < dDe) return null;
  const ms = dAte.getTime() - dDe.getTime();
  const prevAte = new Date(dDe.getTime() - 86400000);
  const prevDe = new Date(prevAte.getTime() - ms);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { de: fmt(prevDe), ate: fmt(prevAte) };
}

type LeituraInterna = {
  data_hora: string;
  horimetro_raw: string;
  parsed: { valor: number; unidade: string };
  litros: number;
  motorista_key: string;
  motorista_label: string;
  ativo_equipamento: string;
};

type BuildConsumoResult = {
  equipamentos: ConsumoEquipamento[];
  sem_dados_horimetro: number;
  sem_horimetro_rows: SemHorimetroRow[];
  horimetro_regressivo_total: number;
};

export function buildConsumoPorEquipamento(
  rows: MelosaAbastecimentoRow[],
  mobilidadePorAtivo: Map<string, string | null> = new Map(),
): BuildConsumoResult {
  const porAtivo = new Map<string, MelosaAbastecimentoRow[]>();
  let semHorimetro = 0;
  const semHorimetroRows: SemHorimetroRow[] = [];
  let horimetroRegressivoTotal = 0;

  rows.forEach((row) => {
    const ativo = normAtivo(row.ativo_equipamento_texto);
    if (!ativo) return;
    const litros = litrosFromRow(row);
    if (litros <= 0) return;
    const horRaw = String(row.melosa_horimetro_equipamento_abastecido_numero ?? "").trim();
    if (!horRaw || !parseHorimetroNumero(horRaw)) {
      semHorimetro += 1;
      if (semHorimetroRows.length < 200) {
        semHorimetroRows.push({
          operation_id: row.operation_id ?? null,
          data_hora: String(row.data_hora ?? ""),
          ativo,
          nome: String(row.ativo_equipamento_nome ?? "").trim() || null,
          horimetro_informado: horRaw || null,
          litros,
        });
      }
    }
    const list = porAtivo.get(ativo) ?? [];
    list.push(row);
    porAtivo.set(ativo, list);
  });

  const equipamentos: ConsumoEquipamento[] = [];

  porAtivo.forEach((abastecimentos, ativo) => {
    const sorted = [...abastecimentos].sort((a, b) => {
      const ta = parseDataHora(a.data_hora)?.getTime() ?? 0;
      const tb = parseDataHora(b.data_hora)?.getTime() ?? 0;
      return ta - tb;
    });

    let nome: string | null = null;
    let empresa: string | null = null;
    sorted.forEach((r) => {
      const n = String(r.ativo_equipamento_nome ?? "").trim();
      if (n && !nome) nome = n;
      const e = String(r.ativo_equipamento_empresa ?? "").trim();
      if (e && !empresa) empresa = e;
    });

    const leituras: LeituraInterna[] = [];
    sorted.forEach((r) => {
      const horRaw = String(r.melosa_horimetro_equipamento_abastecido_numero ?? "").trim();
      const parsed = parseHorimetroNumero(horRaw);
      const litros = litrosFromRow(r);
      if (!parsed || litros <= 0) return;
      const mot = normalizeMotoristaKey(r.melosa_motorista_equipamento_abastecido);
      leituras.push({
        data_hora: String(r.data_hora ?? ""),
        horimetro_raw: horRaw,
        parsed,
        litros,
        motorista_key: mot.key,
        motorista_label: mot.label,
        ativo_equipamento: ativo,
      });
    });

    const trechos: ConsumoTrecho[] = [];
    let totalLitros = 0;
    let totalUnidade = 0;
    let unidade = leituras[0]?.parsed.unidade ?? "h";
    let horimetroRegressivo = 0;

    for (let i = 1; i < leituras.length; i += 1) {
      const prev = leituras[i - 1];
      const cur = leituras[i];
      if (prev.parsed.unidade !== cur.parsed.unidade) {
        horimetroRegressivo += 1;
        horimetroRegressivoTotal += 1;
        continue;
      }
      const delta = cur.parsed.valor - prev.parsed.valor;
      if (delta <= 0) {
        horimetroRegressivo += 1;
        horimetroRegressivoTotal += 1;
        continue;
      }
      totalLitros += cur.litros;
      totalUnidade += delta;
      unidade = cur.parsed.unidade;
      trechos.push({
        data_hora_inicio: prev.data_hora,
        data_hora_fim: cur.data_hora,
        horimetro_inicio: prev.horimetro_raw,
        horimetro_fim: cur.horimetro_raw,
        delta_unidade: delta,
        litros: cur.litros,
        litros_por_unidade: cur.litros / delta,
      });
    }

    const ultimaLeitura = leituras[leituras.length - 1];
    const ultimoAbast = sorted[sorted.length - 1];

    equipamentos.push({
      ativo,
      nome,
      empresa,
      mobilidade: mobilidadePorAtivo.get(ativo) ?? null,
      unidade,
      abastecimentos_count: sorted.length,
      leituras_com_horimetro: leituras.length,
      trechos_count: trechos.length,
      total_litros_periodo: totalLitros,
      total_unidade: totalUnidade,
      media_litros_por_unidade: totalUnidade > 0 ? totalLitros / totalUnidade : null,
      ultimo_horimetro: ultimaLeitura?.horimetro_raw ?? null,
      ultimo_abastecimento: ultimoAbast?.data_hora ?? null,
      horimetro_regressivo_count: horimetroRegressivo,
      trechos,
    });
  });

  equipamentos.sort((a, b) => {
    const ma = a.media_litros_por_unidade ?? -1;
    const mb = b.media_litros_por_unidade ?? -1;
    if (mb !== ma) return mb - ma;
    return a.ativo.localeCompare(b.ativo, "pt-BR");
  });

  return {
    equipamentos,
    sem_dados_horimetro: semHorimetro,
    sem_horimetro_rows: semHorimetroRows,
    horimetro_regressivo_total: horimetroRegressivoTotal,
  };
}

type TrechoComMotorista = ConsumoTrecho & {
  motorista_key: string;
  motorista_label: string;
  ativo_equipamento: string;
};

/** Calcula trechos por equipamento e agrega por motorista do abastecimento atual. */
export function buildConsumoPorMotorista(
  rows: MelosaAbastecimentoRow[],
): ConsumoMotorista[] {
  const porAtivo = new Map<string, MelosaAbastecimentoRow[]>();
  rows.forEach((row) => {
    const ativo = normAtivo(row.ativo_equipamento_texto);
    if (!ativo) return;
    if (litrosFromRow(row) <= 0) return;
    const list = porAtivo.get(ativo) ?? [];
    list.push(row);
    porAtivo.set(ativo, list);
  });

  const trechosPorMotorista = new Map<string, TrechoComMotorista[]>();
  const abastCount = new Map<string, number>();
  const leiturasCount = new Map<string, number>();
  const labels = new Map<string, string>();
  const ativosPorMotorista = new Map<string, Set<string>>();
  const ultimoAbast = new Map<string, string>();
  const ultimoHorimetro = new Map<string, string>();
  const regressivo = new Map<string, number>();

  porAtivo.forEach((abastecimentos, ativo) => {
    const sorted = [...abastecimentos].sort((a, b) => {
      const ta = parseDataHora(a.data_hora)?.getTime() ?? 0;
      const tb = parseDataHora(b.data_hora)?.getTime() ?? 0;
      return ta - tb;
    });

    const leituras: LeituraInterna[] = [];
    sorted.forEach((r) => {
      const horRaw = String(r.melosa_horimetro_equipamento_abastecido_numero ?? "").trim();
      const parsed = parseHorimetroNumero(horRaw);
      const litros = litrosFromRow(r);
      if (!parsed || litros <= 0) return;
      const mot = normalizeMotoristaKey(r.melosa_motorista_equipamento_abastecido);
      labels.set(mot.key, mot.label);
      leiturasCount.set(mot.key, (leiturasCount.get(mot.key) ?? 0) + 1);
      abastCount.set(mot.key, (abastCount.get(mot.key) ?? 0) + 1);
      const setAtivos = ativosPorMotorista.get(mot.key) ?? new Set<string>();
      setAtivos.add(ativo);
      ativosPorMotorista.set(mot.key, setAtivos);
      const dh = String(r.data_hora ?? "");
      const prevDh = ultimoAbast.get(mot.key);
      if (!prevDh || (parseDataHora(dh)?.getTime() ?? 0) >= (parseDataHora(prevDh)?.getTime() ?? 0)) {
        ultimoAbast.set(mot.key, dh);
        ultimoHorimetro.set(mot.key, horRaw);
      }
      leituras.push({
        data_hora: dh,
        horimetro_raw: horRaw,
        parsed,
        litros,
        motorista_key: mot.key,
        motorista_label: mot.label,
        ativo_equipamento: ativo,
      });
    });

    // Contar abastecimentos totais por motorista neste ativo (incluindo sem horímetro válido no loop acima só conta válidos)
    sorted.forEach((r) => {
      if (litrosFromRow(r) <= 0) return;
      const mot = normalizeMotoristaKey(r.melosa_motorista_equipamento_abastecido);
      // abast já contado só em leituras válidas; reforça total com todos os abast do motorista neste ativo
      // (já incrementamos em leituras; para abast sem horímetro também contam):
      const horRaw = String(r.melosa_horimetro_equipamento_abastecido_numero ?? "").trim();
      if (!parseHorimetroNumero(horRaw)) {
        labels.set(mot.key, mot.label);
        abastCount.set(mot.key, (abastCount.get(mot.key) ?? 0) + 1);
        const setAtivos = ativosPorMotorista.get(mot.key) ?? new Set<string>();
        setAtivos.add(ativo);
        ativosPorMotorista.set(mot.key, setAtivos);
      }
    });

    for (let i = 1; i < leituras.length; i += 1) {
      const prev = leituras[i - 1];
      const cur = leituras[i];
      if (prev.parsed.unidade !== cur.parsed.unidade) {
        regressivo.set(cur.motorista_key, (regressivo.get(cur.motorista_key) ?? 0) + 1);
        continue;
      }
      const delta = cur.parsed.valor - prev.parsed.valor;
      if (delta <= 0) {
        regressivo.set(cur.motorista_key, (regressivo.get(cur.motorista_key) ?? 0) + 1);
        continue;
      }
      const trecho: TrechoComMotorista = {
        data_hora_inicio: prev.data_hora,
        data_hora_fim: cur.data_hora,
        horimetro_inicio: prev.horimetro_raw,
        horimetro_fim: cur.horimetro_raw,
        delta_unidade: delta,
        litros: cur.litros,
        litros_por_unidade: cur.litros / delta,
        motorista_key: cur.motorista_key,
        motorista_label: cur.motorista_label,
        ativo_equipamento: ativo,
      };
      const list = trechosPorMotorista.get(cur.motorista_key) ?? [];
      list.push(trecho);
      trechosPorMotorista.set(cur.motorista_key, list);
    }
  });

  const motoristas: ConsumoMotorista[] = [];
  const keys = new Set([...trechosPorMotorista.keys(), ...abastCount.keys()]);
  keys.forEach((key) => {
    const trechosRaw = trechosPorMotorista.get(key) ?? [];
    if (trechosRaw.length === 0 && (leiturasCount.get(key) ?? 0) < 2) return;

    let totalLitros = 0;
    let totalUnidade = 0;
    let unidade = "h";
    const trechos: ConsumoTrecho[] = trechosRaw.map((t) => {
      totalLitros += t.litros;
      totalUnidade += t.delta_unidade;
      return {
        data_hora_inicio: t.data_hora_inicio,
        data_hora_fim: t.data_hora_fim,
        horimetro_inicio: t.horimetro_inicio,
        horimetro_fim: t.horimetro_fim,
        delta_unidade: t.delta_unidade,
        litros: t.litros,
        litros_por_unidade: t.litros_por_unidade,
      };
    });
    if (trechosRaw.length > 0) {
      const last = trechosRaw[trechosRaw.length - 1];
      const u = parseHorimetroNumero(last.horimetro_fim);
      if (u) unidade = u.unidade;
    }

    const label = labels.get(key) ?? SEM_MOTORISTA_LABEL;
    motoristas.push({
      ativo: label,
      nome: null,
      empresa: null,
      mobilidade: null,
      unidade,
      abastecimentos_count: abastCount.get(key) ?? 0,
      leituras_com_horimetro: leiturasCount.get(key) ?? 0,
      trechos_count: trechos.length,
      total_litros_periodo: totalLitros,
      total_unidade: totalUnidade,
      media_litros_por_unidade: totalUnidade > 0 ? totalLitros / totalUnidade : null,
      ultimo_horimetro: ultimoHorimetro.get(key) ?? null,
      ultimo_abastecimento: ultimoAbast.get(key) ?? null,
      horimetro_regressivo_count: regressivo.get(key) ?? 0,
      trechos,
      motorista_key: key,
      equipamentos_distintos: ativosPorMotorista.get(key)?.size ?? 0,
    });
  });

  return motoristas
    .filter((m) => m.trechos_count >= 1 || m.leituras_com_horimetro >= 2)
    .sort((a, b) => {
      const ma = a.media_litros_por_unidade ?? -1;
      const mb = b.media_litros_por_unidade ?? -1;
      if (mb !== ma) return mb - ma;
      return a.ativo.localeCompare(b.ativo, "pt-BR");
    });
}

function isAtivoTanquePattern(ativo: string): boolean {
  // Ex.: T229-1 — patrimônio gerado para tanques de obra
  return /^T\d+-\d+$/i.test(ativo.trim());
}

async function fetchAtivosSomenteEquipamento(
  service: SupabaseClient,
  ativos: string[],
): Promise<Set<string>> {
  const wanted = new Set(
    ativos.map((a) => normAtivo(a)).filter((a) => a && !isAtivoTanquePattern(a)),
  );
  if (wanted.size === 0) return new Set();

  const { data, error } = await service
    .from("equipamentos")
    .select("ativo")
    .eq("tipo", "EQUIPAMENTO");
  if (error) throw new Error(error.message);

  const permitidos = new Set<string>();
  (data ?? []).forEach((row) => {
    const ativo = normAtivo(row.ativo);
    if (wanted.has(ativo)) permitidos.add(ativo);
  });
  return permitidos;
}

function filtrarRowsSomenteEquipamento(
  rows: MelosaAbastecimentoRow[],
  ativosEquipamento: Set<string>,
): MelosaAbastecimentoRow[] {
  return rows.filter((r) => {
    const ativo = normAtivo(r.ativo_equipamento_texto);
    if (!ativo || isAtivoTanquePattern(ativo)) return false;
    // Sem cadastro como EQUIPAMENTO: não entra no consumo médio (evita tanque/melosa/texto livre)
    return ativosEquipamento.has(ativo);
  });
}

async function fetchMobilidadePorAtivo(
  service: SupabaseClient,
  ativos: string[],
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (ativos.length === 0) return map;

  const chunks: string[][] = [];
  for (let i = 0; i < ativos.length; i += 100) {
    chunks.push(ativos.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    const { data } = await service
      .from("equipamentos")
      .select("ativo, mobilidade")
      .eq("tipo", "EQUIPAMENTO")
      .in("ativo", chunk);
    (data ?? []).forEach((row) => {
      map.set(normAtivo(row.ativo), row.mobilidade ?? null);
    });
  }
  return map;
}

async function fetchMovimentacoes(
  service: SupabaseClient,
  filtros: EquipamentoConsumoFiltros,
  obraScope: number[] | null,
): Promise<MelosaAbastecimentoRow[]> {
  let query = service
    .from("melosa_movimentacoes")
    .select(
      "operation_id, data_hora, ativo_melosa_texto, ativo_equipamento_texto, ativo_equipamento_nome, ativo_equipamento_empresa, melosa_horimetro_equipamento_abastecido_numero, melosa_quantidade_abastecida, melosa_motorista_equipamento_abastecido, litros, obra_codigo",
    )
    .not("ativo_equipamento_texto", "is", null)
    .order("data_hora", { ascending: true });

  if (filtros.de) query = query.gte("data_hora", `${filtros.de}T00:00:00`);
  if (filtros.ate) query = query.lte("data_hora", `${filtros.ate}T23:59:59`);

  if (filtros.obraCodigo != null) {
    query = query.eq("obra_codigo", filtros.obraCodigo);
  } else if (obraScope && obraScope.length > 0) {
    query = query.in("obra_codigo", obraScope);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let rows = (data ?? []) as MelosaAbastecimentoRow[];

  // Transferências melosa→melosa não entram no consumo de equipamento.
  const { data: melosasCadastro } = await service.from("equipamentos").select("ativo").eq("tipo", "MELOSA");
  const melosasSet = new Set((melosasCadastro ?? []).map((m) => normAtivo(m.ativo)));
  rows = rows.filter((r) => {
    const destino = normAtivo(r.ativo_equipamento_texto);
    if (destino && melosasSet.has(destino)) return false;
    return true;
  });

  if (filtros.ativoEquipamento) {
    const alvo = normAtivo(filtros.ativoEquipamento);
    rows = rows.filter((r) => normAtivo(r.ativo_equipamento_texto) === alvo);
  }
  if (filtros.ativoMelosa) {
    const melosa = normAtivo(filtros.ativoMelosa);
    rows = rows.filter((r) => normAtivo(r.ativo_melosa_texto) === melosa);
  }
  return rows;
}

export function buildSerieMensal(
  ativo: string,
  rows: MelosaAbastecimentoRow[],
  mobilidadePorAtivo: Map<string, string | null>,
  mesesCount = 12,
): ConsumoMesPoint[] {
  const alvo = normAtivo(ativo);
  const filtered = rows.filter((r) => normAtivo(r.ativo_equipamento_texto) === alvo);
  const now = new Date();
  const points: ConsumoMesPoint[] = [];

  for (let i = mesesCount - 1; i >= 0; i -= 1) {
    const ref = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = ref.getFullYear();
    const m = ref.getMonth();
    const mesKey = `${y}-${String(m + 1).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(ref);

    const monthRows = filtered.filter((r) => {
      const dt = parseDataHora(r.data_hora);
      return dt && dt.getFullYear() === y && dt.getMonth() === m;
    });

    const built = buildConsumoPorEquipamento(monthRows, mobilidadePorAtivo);
    const eq = built.equipamentos.find((e) => e.ativo === alvo);

    points.push({
      mes: mesKey,
      label,
      media_litros_por_unidade: eq?.media_litros_por_unidade ?? null,
      total_litros: eq?.total_litros_periodo ?? 0,
      trechos_count: eq?.trechos_count ?? 0,
    });
  }

  return points;
}

function resolveMetaEfetiva(
  eq: ConsumoEquipamento,
  metaEquipamento: MetaEquipamento | null,
  metasGlobais: ConsumoMeta[],
): number | null {
  if (metaEquipamento && metaEquipamento.unidade === eq.unidade) {
    return metaEquipamento.meta_litros_por_unidade;
  }
  return resolveMetaParaEquipamento(metasGlobais, eq.mobilidade, eq.unidade);
}

export async function buildEquipamentoConsumoDetalhe(
  service: SupabaseClient,
  ativo: string,
  filtros: EquipamentoConsumoFiltros,
  obraScope: number[] | null,
  meses = 12,
): Promise<EquipamentoConsumoDetalhe | null> {
  const alvo = normAtivo(ativo);
  const agora = new Date();
  const de12 = new Date(agora.getFullYear(), agora.getMonth() - (meses - 1), 1);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const deFetch = filtros.de ?? fmt(de12);
  const ateFetch = filtros.ate ?? fmt(agora);

  const [rowsPeriodo, rowsSerie, metas, metaEquipamento] = await Promise.all([
    fetchMovimentacoes(service, { ...filtros, ativoEquipamento: alvo, de: filtros.de, ate: filtros.ate }, obraScope),
    fetchMovimentacoes(service, { ativoEquipamento: alvo, de: deFetch, ate: ateFetch }, obraScope),
    fetchConsumoMetas(service),
    fetchMetaEquipamento(service, alvo),
  ]);

  const mobilidadePorAtivo = await fetchMobilidadePorAtivo(service, [alvo]);
  const built = buildConsumoPorEquipamento(rowsPeriodo, mobilidadePorAtivo);
  const equipamento = built.equipamentos.find((e) => e.ativo === alvo && e.leituras_com_horimetro >= 2);
  if (!equipamento) return null;

  const serie_mensal = buildSerieMensal(alvo, rowsSerie, mobilidadePorAtivo, meses);
  const meta_efetiva = resolveMetaEfetiva(equipamento, metaEquipamento, metas);

  return {
    equipamento,
    meta_equipamento: metaEquipamento,
    meta_efetiva,
    serie_mensal,
    periodo: { de: filtros.de ?? null, ate: filtros.ate ?? null },
  };
}

export async function buildEquipamentoConsumoDashboard(
  service: SupabaseClient,
  filtros: EquipamentoConsumoFiltros,
  obraScope: number[] | null,
): Promise<EquipamentoConsumoResposta> {
  const [rowsRaw, metas] = await Promise.all([
    fetchMovimentacoes(service, filtros, obraScope),
    fetchConsumoMetas(service),
  ]);

  const ativosBrutos = Array.from(
    new Set(rowsRaw.map((r) => normAtivo(r.ativo_equipamento_texto)).filter(Boolean)),
  );
  const ativosEquipamento = await fetchAtivosSomenteEquipamento(service, ativosBrutos);
  const rows = filtrarRowsSomenteEquipamento(rowsRaw, ativosEquipamento);

  const ativos = Array.from(
    new Set(rows.map((r) => normAtivo(r.ativo_equipamento_texto)).filter(Boolean)),
  );
  const [mobilidadePorAtivo, metasEquipamentoMap] = await Promise.all([
    fetchMobilidadePorAtivo(service, ativos),
    fetchMetasEquipamento(service, ativos),
  ]);

  const built = buildConsumoPorEquipamento(rows, mobilidadePorAtivo);
  const equipamentos = built.equipamentos.filter((e) => e.leituras_com_horimetro >= 2);
  const motoristas = buildConsumoPorMotorista(rows).filter((m) => m.leituras_com_horimetro >= 2);

  let totalLitrosEquipamentos = 0;
  let abastecimentosEquipamentos = 0;
  rows.forEach((row) => {
    const litros = litrosFromRow(row);
    if (litros <= 0) return;
    totalLitrosEquipamentos += litros;
    abastecimentosEquipamentos += 1;
  });

  let periodoAnterior: PeriodoAnteriorResumo | null = null;
  if (filtros.compararPeriodoAnterior && filtros.de && filtros.ate) {
    const prev = calcPeriodoAnterior(filtros.de, filtros.ate);
    if (prev) {
      const prevRowsRaw = await fetchMovimentacoes(
        service,
        { ...filtros, de: prev.de, ate: prev.ate, compararPeriodoAnterior: false },
        obraScope,
      );
      const prevAtivosBrutos = Array.from(
        new Set(prevRowsRaw.map((r) => normAtivo(r.ativo_equipamento_texto)).filter(Boolean)),
      );
      const prevAtivosEquipamento = await fetchAtivosSomenteEquipamento(service, prevAtivosBrutos);
      const prevRows = filtrarRowsSomenteEquipamento(prevRowsRaw, prevAtivosEquipamento);
      const prevBuilt = buildConsumoPorEquipamento(prevRows, mobilidadePorAtivo);
      const porAtivo: PeriodoAnteriorResumo["por_ativo"] = {};
      prevBuilt.equipamentos
        .filter((e) => e.leituras_com_horimetro >= 2)
        .forEach((e) => {
          porAtivo[e.ativo] = {
            media_litros_por_unidade: e.media_litros_por_unidade,
            unidade: e.unidade,
          };
        });
      periodoAnterior = { de: prev.de, ate: prev.ate, por_ativo: porAtivo };
    }
  }

  return {
    periodo: { de: filtros.de ?? null, ate: filtros.ate ?? null },
    equipamentos,
    motoristas,
    total_litros_equipamentos: totalLitrosEquipamentos,
    abastecimentos_equipamentos: abastecimentosEquipamentos,
    sem_dados_horimetro: built.sem_dados_horimetro,
    sem_horimetro_rows: built.sem_horimetro_rows,
    horimetro_regressivo_total: built.horimetro_regressivo_total,
    metas,
    metas_equipamento: metasEquipamentoToRecord(metasEquipamentoMap),
    periodo_anterior: periodoAnterior,
  };
}
