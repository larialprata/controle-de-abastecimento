import type { SupabaseClient } from "@supabase/supabase-js";
import { parseMedidorNumero } from "./melosaMedidorContinuidade";

export type AlertaGravidade = "info" | "warning" | "critical";

export type AlertaTipo =
  | "capacidade_ultrapassada"
  | "fechamento_ciclo"
  | "litros_vs_quantidade"
  | "gps_ausente"
  | "volume_outlier"
  | "sem_foto_obrigatoria";

export type AlertaItem = {
  id: string;
  tipo: AlertaTipo;
  gravidade: AlertaGravidade;
  data_hora: string;
  obra_codigo: number | null;
  obra_nome: string | null;
  ativo_melosa: string | null;
  ativo_equipamento: string | null;
  motorista: string | null;
  operador: string | null;
  usuario: string | null;
  local_address: string | null;
  litros: number | null;
  volume_suspeito: number | null;
  titulo: string;
  operation_id: string | null;
  link_bi: string | null;
};

export type RankingPessoa = {
  pessoa: string;
  papel: "motorista" | "operador" | "usuario";
  alertas: number;
  volume_suspeito: number;
};

export type AlertasResposta = {
  periodo: { de: string | null; ate: string | null };
  alertas: AlertaItem[];
  kpis: { total: number; volume_suspeito_litros: number };
  ranking_pessoas: RankingPessoa[];
};

export type AlertasFiltros = {
  de?: string | null;
  ate?: string | null;
  obraCodigo?: number | null;
};

const MARGEM_FECHAMENTO_PCT = 3.5;
const DESVIO_LITROS_VS_QTD = 5;
const OUTLIER_MULT = 3;

function toNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function litrosMelosa(row: Record<string, unknown>): number {
  const fromQ = parseMedidorNumero(row.melosa_quantidade_abastecida as string | null);
  if (fromQ != null && fromQ > 0) return fromQ;
  return toNum(row.litros);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function diaKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function pessoasBase(
  motorista: string | null,
  operador: string | null,
  usuario: string | null,
  localAddress: string | null,
) {
  return { motorista, operador, usuario, local_address: localAddress };
}

export async function buildAlertasDashboard(
  service: SupabaseClient,
  filtros: AlertasFiltros,
  obraScope: number[] | null,
): Promise<AlertasResposta> {
  const alertas: AlertaItem[] = [];

  let ciclosQ = service
    .from("melosa_ciclos")
    .select(
      "id, ciclo_numero, ativo_melosa, obra_codigo, status, volume_excedente, litros_retirada, litros_abastecidos, litros_sobra_anterior, data_hora_retirada, alerta_oculto, capacidade_litros",
    )
    .eq("status", "suspeito")
    .order("data_hora_retirada", { ascending: false })
    .limit(100);

  if (filtros.de) ciclosQ = ciclosQ.gte("data_hora_retirada", `${filtros.de}T00:00:00`);
  if (filtros.ate) ciclosQ = ciclosQ.lte("data_hora_retirada", `${filtros.ate}T23:59:59`);
  if (filtros.obraCodigo != null) ciclosQ = ciclosQ.eq("obra_codigo", filtros.obraCodigo);
  else if (obraScope && obraScope.length > 0) ciclosQ = ciclosQ.in("obra_codigo", obraScope);

  const { data: ciclosRaw } = await ciclosQ;
  const ciclos = (ciclosRaw ?? []).filter((c) => !c.alerta_oculto);

  let movQ = service
    .from("melosa_movimentacoes")
    .select(
      "operation_id, data_hora, obra_codigo, litros, melosa_quantidade_abastecida, ativo_melosa_texto, ativo_equipamento_texto, melosa_motorista_equipamento_abastecido, melosa_operador_nome, usuario_id, local_latitude, local_longitude, local_address, melosa_quantidade_abastecida_storage_path",
    )
    .order("data_hora", { ascending: false })
    .limit(2000);

  if (filtros.de) movQ = movQ.gte("data_hora", `${filtros.de}T00:00:00`);
  if (filtros.ate) movQ = movQ.lte("data_hora", `${filtros.ate}T23:59:59`);
  if (filtros.obraCodigo != null) movQ = movQ.eq("obra_codigo", filtros.obraCodigo);
  else if (obraScope && obraScope.length > 0) movQ = movQ.in("obra_codigo", obraScope);

  const { data: movRaw } = await movQ;
  const movs = (movRaw ?? []) as Record<string, unknown>[];

  const obraCodigos = Array.from(
    new Set(
      [
        ...ciclos.map((c) => c.obra_codigo).filter((n): n is number => typeof n === "number"),
        ...movs.map((m) => m.obra_codigo).filter((n): n is number => typeof n === "number"),
      ],
    ),
  );
  const obraNome = new Map<number, string>();
  if (obraCodigos.length > 0) {
    const { data: obras } = await service.from("obras").select("codigo, nome").in("codigo", obraCodigos);
    (obras ?? []).forEach((o) => obraNome.set(Number(o.codigo), String(o.nome ?? "")));
  }

  const userIds = Array.from(
    new Set(movs.map((m) => m.usuario_id).filter((id): id is string => typeof id === "string")),
  );
  const userName = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await service.from("profiles").select("user_id, full_name").in("user_id", userIds);
    (profiles ?? []).forEach((p) => {
      if (p.user_id && p.full_name) userName.set(String(p.user_id), String(p.full_name));
    });
  }

  const emptyPessoas = pessoasBase(null, null, null, null);

  ciclos.forEach((c) => {
    const vol = toNum(c.volume_excedente);
    const retirada = toNum(c.litros_retirada);
    const abast = toNum(c.litros_abastecidos);
    alertas.push({
      id: `cap-${c.id}`,
      tipo: "capacidade_ultrapassada",
      gravidade: "critical",
      data_hora: String(c.data_hora_retirada ?? ""),
      obra_codigo: c.obra_codigo ?? null,
      obra_nome: c.obra_codigo != null ? obraNome.get(c.obra_codigo) ?? null : null,
      ativo_melosa: c.ativo_melosa ?? null,
      ativo_equipamento: null,
      ...emptyPessoas,
      litros: retirada,
      volume_suspeito: vol,
      titulo: "Capacidade ultrapassada",
      operation_id: null,
      link_bi: null,
    });

    if (retirada > 0) {
      const diff = retirada - abast;
      const pct = (diff / retirada) * 100;
      const margem = (MARGEM_FECHAMENTO_PCT * retirada) / 100;
      if (pct > MARGEM_FECHAMENTO_PCT) {
        const suspeito = Math.max(0, diff - margem);
        alertas.push({
          id: `fech-${c.id}`,
          tipo: "fechamento_ciclo",
          gravidade: suspeito > 50 ? "critical" : "warning",
          data_hora: String(c.data_hora_retirada ?? ""),
          obra_codigo: c.obra_codigo ?? null,
          obra_nome: c.obra_codigo != null ? obraNome.get(c.obra_codigo) ?? null : null,
          ativo_melosa: c.ativo_melosa ?? null,
          ativo_equipamento: null,
          ...emptyPessoas,
          litros: retirada,
          volume_suspeito: suspeito,
          titulo: "Fechamento suspeito",
          operation_id: null,
          link_bi: null,
        });
      }
    }
  });

  const litrosPorObraDia = new Map<string, number[]>();
  movs.forEach((m) => {
    const litros = litrosMelosa(m);
    if (litros <= 0) return;
    const obra = typeof m.obra_codigo === "number" ? m.obra_codigo : null;
    const dia = diaKey(String(m.data_hora ?? ""));
    if (obra == null || !dia) return;
    const key = `${obra}|${dia}`;
    const list = litrosPorObraDia.get(key) ?? [];
    list.push(litros);
    litrosPorObraDia.set(key, list);
  });

  movs.forEach((m) => {
    const opId = typeof m.operation_id === "string" ? m.operation_id : null;
    const litros = litrosMelosa(m);
    const qtdParsed = parseMedidorNumero(m.melosa_quantidade_abastecida as string | null);
    const litrosCampo = toNum(m.litros);
    const motorista = String(m.melosa_motorista_equipamento_abastecido ?? "").trim() || null;
    const operador = String(m.melosa_operador_nome ?? "").trim() || null;
    const usuario = typeof m.usuario_id === "string" ? userName.get(m.usuario_id) ?? null : null;
    const localAddress = String(m.local_address ?? "").trim() || null;
    const pessoas = pessoasBase(motorista, operador, usuario, localAddress);
    const obra = typeof m.obra_codigo === "number" ? m.obra_codigo : null;
    const melosa = String(m.ativo_melosa_texto ?? "").trim() || null;
    const equip = String(m.ativo_equipamento_texto ?? "").trim() || null;
    const dh = String(m.data_hora ?? "");
    const link = opId ? `/bi/melosa?op=${encodeURIComponent(opId)}` : null;

    if (qtdParsed != null && litrosCampo > 0 && Math.abs(qtdParsed - litrosCampo) > DESVIO_LITROS_VS_QTD) {
      alertas.push({
        id: `lq-${opId ?? dh}`,
        tipo: "litros_vs_quantidade",
        gravidade: "warning",
        data_hora: dh,
        obra_codigo: obra,
        obra_nome: obra != null ? obraNome.get(obra) ?? null : null,
        ativo_melosa: melosa,
        ativo_equipamento: equip,
        ...pessoas,
        litros: qtdParsed,
        volume_suspeito: Math.abs(qtdParsed - litrosCampo),
        titulo: "Litros divergentes",
        operation_id: opId,
        link_bi: link,
      });
    }

    const lat = m.local_latitude;
    const lng = m.local_longitude;
    const hasGps =
      (typeof lat === "number" || (typeof lat === "string" && lat.trim() !== "")) &&
      (typeof lng === "number" || (typeof lng === "string" && lng.trim() !== ""));
    if (!hasGps) {
      alertas.push({
        id: `gps-${opId ?? dh}`,
        tipo: "gps_ausente",
        gravidade: "info",
        data_hora: dh,
        obra_codigo: obra,
        obra_nome: obra != null ? obraNome.get(obra) ?? null : null,
        ativo_melosa: melosa,
        ativo_equipamento: equip,
        ...pessoas,
        litros: litros > 0 ? litros : null,
        volume_suspeito: null,
        titulo: "Sem GPS",
        operation_id: opId,
        link_bi: link,
      });
    }

    if (!String(m.melosa_quantidade_abastecida_storage_path ?? "").trim() && litros > 0) {
      alertas.push({
        id: `foto-${opId ?? dh}`,
        tipo: "sem_foto_obrigatoria",
        gravidade: "warning",
        data_hora: dh,
        obra_codigo: obra,
        obra_nome: obra != null ? obraNome.get(obra) ?? null : null,
        ativo_melosa: melosa,
        ativo_equipamento: equip,
        ...pessoas,
        litros,
        volume_suspeito: null,
        titulo: "Sem foto",
        operation_id: opId,
        link_bi: link,
      });
    }

    if (obra != null && litros > 0) {
      const key = `${obra}|${diaKey(dh)}`;
      const med = median(litrosPorObraDia.get(key) ?? []);
      if (med != null && med > 0 && litros >= med * OUTLIER_MULT && litros >= 100) {
        alertas.push({
          id: `out-${opId ?? dh}`,
          tipo: "volume_outlier",
          gravidade: "critical",
          data_hora: dh,
          obra_codigo: obra,
          obra_nome: obraNome.get(obra) ?? null,
          ativo_melosa: melosa,
          ativo_equipamento: equip,
          ...pessoas,
          litros,
          volume_suspeito: litros - med,
          titulo: "Volume alto",
          operation_id: opId,
          link_bi: link,
        });
      }
    }
  });

  alertas.sort((a, b) => String(b.data_hora).localeCompare(String(a.data_hora)));

  const rankingMap = new Map<string, RankingPessoa>();
  const bump = (nome: string, papel: RankingPessoa["papel"], vol: number) => {
    const key = `${papel}|${nome.toUpperCase()}`;
    const cur = rankingMap.get(key) ?? { pessoa: nome, papel, alertas: 0, volume_suspeito: 0 };
    cur.alertas += 1;
    cur.volume_suspeito += vol;
    rankingMap.set(key, cur);
  };
  alertas.forEach((a) => {
    const vol = a.volume_suspeito ?? 0;
    if (a.motorista) bump(a.motorista, "motorista", vol);
    if (a.operador) bump(a.operador, "operador", vol);
    if (a.usuario) bump(a.usuario, "usuario", vol);
  });

  const volumeSuspeito = alertas.reduce((acc, a) => acc + (a.volume_suspeito ?? 0), 0);

  return {
    periodo: { de: filtros.de ?? null, ate: filtros.ate ?? null },
    alertas: alertas.slice(0, 400),
    kpis: { total: alertas.length, volume_suspeito_litros: volumeSuspeito },
    ranking_pessoas: Array.from(rankingMap.values())
      .sort((a, b) => b.volume_suspeito - a.volume_suspeito || a.pessoa.localeCompare(b.pessoa, "pt-BR"))
      .slice(0, 80),
  };
}
