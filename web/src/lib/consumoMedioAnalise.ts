import { resolveMetaEfetiva, type ConsumoMeta, type MetaEquipamento } from "./consumoMetasShared";

export type { ConsumoMeta, MetaEquipamento };

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

export type AlertaSeveridade = "info" | "warning" | "danger";

export type ConsumoAlerta = {
  id: string;
  tipo:
    | "consumo_alto"
    | "pico_trecho"
    | "acima_frota"
    | "baixa_confianca"
    | "sem_horimetro"
    | "horimetro_regressivo"
    | "piorou_periodo"
    | "acima_meta";
  severidade: AlertaSeveridade;
  ativo: string | null;
  titulo: string;
  descricao: string;
};

export type ConsumoBadge = {
  key: string;
  label: string;
  severidade: AlertaSeveridade;
};

export type ConsumoNivel = "ok" | "atencao" | "critico";

export type EquipamentoAnalise = {
  ativo: string;
  nivel: ConsumoNivel;
  badges: ConsumoBadge[];
  meta: number | null;
  metaOrigem: "equipamento" | "mobilidade" | null;
  mediaFrota: number | null;
  variacaoPeriodo: number | null;
  picoTrecho: ConsumoTrecho | null;
  temAlerta: boolean;
};

const MIN_TRECHOS_CONFIANCA = 3;
const FROTA_ACIMA_PCT = 0.2;
const VARIACAO_PCT_ALERTA = 0.15;

export function mediaFrotaPorUnidade(equipamentos: ConsumoEquipamento[], unidade: string): number | null {
  const vals = equipamentos
    .map((e) => (e.unidade === unidade ? e.media_litros_por_unidade : null))
    .filter((v): v is number => v != null && Number.isFinite(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function fmtPct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function fmtMedia(v: number, unidade: string): string {
  const label = unidade === "km" ? "L/km" : "L/h";
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${label}`;
}

export function analisarEquipamento(
  eq: ConsumoEquipamento,
  ctx: {
    metas: ConsumoMeta[];
    metasEquipamento: Record<string, MetaEquipamento>;
    mediaFrotaH: number | null;
    mediaFrotaKm: number | null;
    periodoAnterior: PeriodoAnteriorResumo | null;
  },
): EquipamentoAnalise {
  const badges: ConsumoBadge[] = [];
  let nivel: ConsumoNivel = "ok";
  const media = eq.media_litros_por_unidade;
  const { meta, origem: metaOrigem } = resolveMetaEfetiva(
    eq.ativo,
    eq.unidade,
    eq.mobilidade,
    ctx.metas,
    ctx.metasEquipamento,
  );
  const mediaFrota = eq.unidade === "km" ? ctx.mediaFrotaKm : ctx.mediaFrotaH;

  const picoTrecho =
    eq.trechos.length > 0
      ? eq.trechos.reduce((max, t) => (t.litros_por_unidade > max.litros_por_unidade ? t : max), eq.trechos[0])
      : null;

  let variacaoPeriodo: number | null = null;
  const prev = ctx.periodoAnterior?.por_ativo[eq.ativo];
  if (prev?.media_litros_por_unidade != null && media != null && prev.unidade === eq.unidade) {
    variacaoPeriodo = (media - prev.media_litros_por_unidade) / prev.media_litros_por_unidade;
  }

  const setNivel = (next: ConsumoNivel) => {
    if (next === "critico") nivel = "critico";
    else if (next === "atencao" && nivel === "ok") nivel = "atencao";
  };

  if (meta != null && media != null && media > meta) {
    badges.push({ key: "acima_meta", label: "Acima da meta", severidade: media > meta * 1.25 ? "danger" : "warning" });
    setNivel(media > meta * 1.25 ? "critico" : "atencao");
  }

  if (media != null && media > 3 && eq.unidade === "h") {
    badges.push({ key: "consumo_alto", label: "Consumo alto", severidade: "danger" });
    setNivel("critico");
  }

  if (picoTrecho && media != null && picoTrecho.litros_por_unidade > media * 1.5) {
    badges.push({ key: "pico_trecho", label: "Pico em trecho", severidade: "warning" });
    setNivel("atencao");
  }

  if (mediaFrota != null && media != null && media > mediaFrota * (1 + FROTA_ACIMA_PCT)) {
    badges.push({ key: "acima_frota", label: "Acima da frota", severidade: "warning" });
    setNivel("atencao");
  }

  if (eq.trechos_count < MIN_TRECHOS_CONFIANCA) {
    badges.push({ key: "baixa_confianca", label: "Poucos dados", severidade: "info" });
  }

  if (eq.horimetro_regressivo_count > 0) {
    badges.push({ key: "horimetro_regressivo", label: "Horímetro irregular", severidade: "warning" });
    setNivel("atencao");
  }

  if (variacaoPeriodo != null && variacaoPeriodo > VARIACAO_PCT_ALERTA) {
    badges.push({ key: "piorou_periodo", label: `+${fmtPct(variacaoPeriodo)} vs período ant.`, severidade: "warning" });
    setNivel("atencao");
  }

  return {
    ativo: eq.ativo,
    nivel,
    badges,
    meta,
    metaOrigem,
    mediaFrota,
    variacaoPeriodo,
    picoTrecho,
    temAlerta: badges.some((b) => b.severidade !== "info"),
  };
}

export function buildAlertas(
  data: EquipamentoConsumoResposta,
  analises: Map<string, EquipamentoAnalise>,
): ConsumoAlerta[] {
  const alertas: ConsumoAlerta[] = [];

  data.equipamentos.forEach((eq) => {
    const a = analises.get(eq.ativo);
    if (!a) return;

    if (a.meta != null && eq.media_litros_por_unidade != null && eq.media_litros_por_unidade > a.meta) {
      const pct = ((eq.media_litros_por_unidade - a.meta) / a.meta) * 100;
      alertas.push({
        id: `${eq.ativo}-meta`,
        tipo: "acima_meta",
        severidade: pct > 25 ? "danger" : "warning",
        ativo: eq.ativo,
        titulo: `${eq.ativo} acima da meta`,
        descricao: `Média ${fmtMedia(eq.media_litros_por_unidade, eq.unidade)} — meta ${fmtMedia(a.meta, eq.unidade)} (+${Math.round(pct)}%).`,
      });
    }

    if (a.picoTrecho && eq.media_litros_por_unidade != null && a.picoTrecho.litros_por_unidade > eq.media_litros_por_unidade * 1.5) {
      alertas.push({
        id: `${eq.ativo}-pico`,
        tipo: "pico_trecho",
        severidade: "warning",
        ativo: eq.ativo,
        titulo: `Pico de consumo em ${eq.ativo}`,
        descricao: `Trecho com ${fmtMedia(a.picoTrecho.litros_por_unidade, eq.unidade)} (média do equipamento: ${fmtMedia(eq.media_litros_por_unidade, eq.unidade)}).`,
      });
    }

    if (a.mediaFrota != null && eq.media_litros_por_unidade != null && eq.media_litros_por_unidade > a.mediaFrota * (1 + FROTA_ACIMA_PCT)) {
      alertas.push({
        id: `${eq.ativo}-frota`,
        tipo: "acima_frota",
        severidade: "warning",
        ativo: eq.ativo,
        titulo: `${eq.ativo} acima da média da frota`,
        descricao: `${fmtMedia(eq.media_litros_por_unidade, eq.unidade)} vs média ${fmtMedia(a.mediaFrota, eq.unidade)}.`,
      });
    }

    if (eq.trechos_count < MIN_TRECHOS_CONFIANCA) {
      alertas.push({
        id: `${eq.ativo}-confianca`,
        tipo: "baixa_confianca",
        severidade: "info",
        ativo: eq.ativo,
        titulo: `Poucos dados para ${eq.ativo}`,
        descricao: `Apenas ${eq.trechos_count} trecho(s) — recomenda-se pelo menos ${MIN_TRECHOS_CONFIANCA}.`,
      });
    }

    if (eq.horimetro_regressivo_count > 0) {
      alertas.push({
        id: `${eq.ativo}-regressivo`,
        tipo: "horimetro_regressivo",
        severidade: "warning",
        ativo: eq.ativo,
        titulo: `Horímetro irregular em ${eq.ativo}`,
        descricao: `${eq.horimetro_regressivo_count} leitura(s) fora de ordem ou com unidade diferente.`,
      });
    }

    if (a.variacaoPeriodo != null && a.variacaoPeriodo > VARIACAO_PCT_ALERTA) {
      alertas.push({
        id: `${eq.ativo}-variacao`,
        tipo: "piorou_periodo",
        severidade: "warning",
        ativo: eq.ativo,
        titulo: `${eq.ativo} piorou vs período anterior`,
        descricao: `Consumo subiu ${fmtPct(a.variacaoPeriodo)} em relação ao período anterior.`,
      });
    }
  });

  if (data.sem_dados_horimetro > 0) {
    alertas.push({
      id: "sem-horimetro",
      tipo: "sem_horimetro",
      severidade: data.sem_dados_horimetro >= 10 ? "warning" : "info",
      ativo: null,
      titulo: "Abastecimentos sem horímetro válido",
      descricao: `${data.sem_dados_horimetro} registro(s) no período não permitem calcular média.`,
    });
  }

  const ordem: Record<AlertaSeveridade, number> = { danger: 0, warning: 1, info: 2 };
  alertas.sort((a, b) => ordem[a.severidade] - ordem[b.severidade]);
  return alertas;
}

export function nivelCorClasses(nivel: ConsumoNivel): string {
  if (nivel === "critico") return "text-red-700 dark:text-red-400";
  if (nivel === "atencao") return "text-amber-700 dark:text-amber-400";
  return "text-emerald-700 dark:text-emerald-400";
}

export function badgeClasses(sev: AlertaSeveridade): string {
  if (sev === "danger") return "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300";
  if (sev === "warning") return "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
  return "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300";
}

export function alertaBorderClasses(sev: AlertaSeveridade): string {
  if (sev === "danger") return "border-red-200/70 bg-red-50/60 dark:border-red-900/40 dark:bg-red-950/20";
  if (sev === "warning") return "border-amber-200/70 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20";
  return "border-slate-200/70 bg-slate-50/60 dark:border-slate-700/40 dark:bg-slate-900/30";
}

export type OrdenacaoConsumo = "media_desc" | "litros_desc" | "trechos_desc" | "ultimo_abast";

export function ordenarEquipamentos(list: ConsumoEquipamento[], ordem: OrdenacaoConsumo): ConsumoEquipamento[] {
  const sorted = [...list];
  sorted.sort((a, b) => {
    if (ordem === "media_desc") return (b.media_litros_por_unidade ?? 0) - (a.media_litros_por_unidade ?? 0);
    if (ordem === "litros_desc") return b.total_litros_periodo - a.total_litros_periodo;
    if (ordem === "trechos_desc") return b.trechos_count - a.trechos_count;
    const ta = new Date(a.ultimo_abastecimento ?? 0).getTime();
    const tb = new Date(b.ultimo_abastecimento ?? 0).getTime();
    return tb - ta;
  });
  return sorted;
}

export function buildMelosaBiLink(ativo: string, de: string, ate: string): string {
  const params = new URLSearchParams({ ativo, de, ate });
  return `/bi/melosa?${params.toString()}`;
}

export function calcSaudeDados(data: EquipamentoConsumoResposta): {
  pctHorimetro: number;
  confiaveis: number;
  total: number;
} {
  const total = data.equipamentos.length;
  const confiaveis = data.equipamentos.filter((e) => e.trechos_count >= MIN_TRECHOS_CONFIANCA).length;
  const comLeitura = data.equipamentos.reduce((acc, e) => acc + e.abastecimentos_count, 0) + data.sem_dados_horimetro;
  const pctHorimetro = comLeitura > 0 ? ((comLeitura - data.sem_dados_horimetro) / comLeitura) * 100 : 100;
  return { pctHorimetro, confiaveis, total };
}
