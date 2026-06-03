import {
  calcQuantidadeLitrosFromMedidores,
  calcQuantidadeLitrosRetiradaTanqueFromMedidores,
} from "./descarbonizeExcel";
import {
  type DashboardAggregateFilters,
  type MovimentoMelosaRow,
  type MovimentoTanqueRow,
  placaAtivoMelosa,
} from "./aggregateCombustivelDashboard";
import {
  calcSaidaMelosaAntesChegar,
  calcularCombustivelControle,
  fmtLitrosDashboard,
  fmtPctDashboard,
} from "./combustivelControle";

export type ResumoEventoTipo = "retirada_tanque" | "abastecimento" | "devolucao_tanque";

export type ResumoEventoLinha = {
  key: string;
  tipo: ResumoEventoTipo;
  tipoLabel: string;
  dataHoraIso: string;
  dataHoraFmt: string;
  litros: number;
  litrosFmt: string;
  local: string;
  horimetro: string;
  equipamento: string;
  responsavel: string;
  obra: string;
  detalhe: string;
};

export type ResumoAnaliseTrecho = {
  label: string;
  horimetroInicio: string;
  horimetroFim: string;
  deltaHorimetro: number | null;
  unidade: string;
  litros: number;
  litrosPorUnidade: number | null;
  observacao: string;
};

/** Por abastecimento: cruza sobra contábil com medidor acumulado da melosa (ini/fin). */
export type ResumoAbastecimentoAnalise = {
  key: string;
  dataHoraFmt: string;
  equipamento: string;
  responsavel: string;
  /** Sobra contábil (recebido − abastecimentos − devoluções anteriores). */
  sobraAntesLitros: number;
  medidorInicial: string;
  medidorFinal: string;
  /** Litros que foram para o equipamento = medidor inicial − final (ex.: 187 − 57 = 130 L). */
  litrosParaEquipamento: number | null;
  /**
   * Litros que “sumiram” da melosa entre a sobra contábil e a leitura ao chegar
   * (ex.: 340 − 187 = 153 L).
   */
  litrosSaidaMelosaAntesChegar: number | null;
  /** Até este % da sobra contábil = gasolina do caminhão / deslocamento aceitável. */
  limiteConsumoMelosaPct: number;
  /** Litros máximos aceitáveis (limite % × sobra contábil antes). */
  consumoGasolinaAceitavelLitros: number | null;
  /** Saída real em % da sobra contábil. */
  litrosSaidaMelosaPct: number | null;
  /** Excesso acima da margem (possível desvio). */
  volumeSuspeitoSaidaLitros: number | null;
  statusSaidaAntesChegar: "ok" | "suspeita" | "na";
  /** Leitura do medidor ao terminar = combustível que ficou na melosa (ex.: 57 L). */
  litrosNaMelosaApos: number | null;
  /** Sobra contábil após o abastecimento (recebido − abast − devolvido). */
  sobraContabilApos: number | null;
  litrosRegistro: number;
  notas: string[];
  alertas: string[];
  status: "ok" | "atencao" | "inconsistente";
};

export type ResumoAtivoMelosaPayload = {
  ativoPlaca: string;
  periodoLabel: string;
  retiradas: ResumoEventoLinha[];
  abastecimentos: ResumoEventoLinha[];
  devolucoes: ResumoEventoLinha[];
  cronologico: ResumoEventoLinha[];
  totais: {
    retiradaTanque: number;
    abastecimentos: number;
    devolvido: number;
    sobra: number;
    volumeJustificado: number;
    diferenca: number;
    diferencaPct: number | null;
    volumeSuspeito: number;
    status: "ok" | "suspeita" | "sem_retirada";
  };
  analiseTrechos: ResumoAnaliseTrecho[];
  analiseAbastecimentos: ResumoAbastecimentoAnalise[];
  responsaveis: string[];
};

type RowBase = {
  obra_codigo?: number;
  obra_nome?: string | null;
  data_hora?: string;
  usuario_full_name?: string | null;
  usuario_id?: string;
  local_address?: string | null;
  local_latitude?: unknown;
  local_longitude?: unknown;
  operation_id?: string;
  id?: string;
};

type TanqueRow = MovimentoTanqueRow &
  RowBase & {
    obra_nome?: string | null;
    fornecedor_texto?: string | null;
    tanque_texto?: string | null;
    combustivel_tipo?: string | null;
    medidor_tanque_numero_inicial?: string | null;
    medidor_tanque_numero_final?: string | null;
  };

type MelosaRow = MovimentoMelosaRow &
  RowBase & {
    obra_nome?: string | null;
    fornecedor_texto?: string | null;
    melosa_horimetro_equipamento_abastecido_numero?: string | null;
    melosa_km_registro?: number | null;
    melosa_km_retirada?: number | null;
    melosa_medidor_acumulado_inicial_numero?: string | null;
    melosa_medidor_acumulado_final_numero?: string | null;
    melosa_motorista_equipamento_abastecido?: string | null;
  };

function parseDataHora(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function inPeriod(dataHora: unknown, filters: DashboardAggregateFilters): boolean {
  const d = parseDataHora(dataHora);
  if (!d) return false;
  if (filters.de && d < startOfDay(filters.de)) return false;
  if (filters.ate && d > endOfDay(filters.ate)) return false;
  return true;
}

function matchObra(obraCodigo: unknown, filterObra: number | null | undefined): boolean {
  if (filterObra == null) return true;
  return obraCodigo === filterObra;
}

function matchUsuario(row: { usuario_id?: string }, usuarioId: string | null | undefined): boolean {
  if (!usuarioId) return true;
  return row.usuario_id === usuarioId;
}

function passesFilters(
  row: RowBase,
  filters: DashboardAggregateFilters,
  ativoNorm: string,
): boolean {
  return (
    inPeriod(row.data_hora, filters) &&
    matchObra(row.obra_codigo, filters.obraCodigo) &&
    matchUsuario(row, filters.usuarioId) &&
    placaAtivoMelosa(row) === ativoNorm
  );
}

function fmtDateBr(v: unknown): string {
  const d = parseDataHora(v);
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function fmtLocal(row: RowBase): string {
  const addr = row.local_address != null ? String(row.local_address).trim() : "";
  if (addr) return addr;
  const lat = row.local_latitude;
  const lng = row.local_longitude;
  if (lat != null && lng != null) return `${lat}, ${lng}`;
  return "—";
}

function fmtObra(row: RowBase, obrasMap: Map<number, string>): string {
  const cod = row.obra_codigo;
  const nome = row.obra_nome != null ? String(row.obra_nome).trim() : "";
  if (cod != null && nome) return `${cod} · ${nome}`;
  if (cod != null) return obrasMap.get(cod) ?? String(cod);
  return nome || "—";
}

function fmtResponsavel(row: RowBase): string {
  const n = row.usuario_full_name;
  if (typeof n === "string" && n.trim()) return n.trim();
  return row.usuario_id ? String(row.usuario_id).slice(0, 8) + "…" : "—";
}

function litrosEntrada(litros: unknown): number {
  if (typeof litros === "number" && Number.isFinite(litros) && litros > 0) return litros;
  return 0;
}

function litrosRetiradaTanqueRow(m: TanqueRow): number {
  const fromMedidor = calcQuantidadeLitrosRetiradaTanqueFromMedidores(
    m.medidor_tanque_numero_inicial,
    m.medidor_tanque_numero_final,
  );
  if (fromMedidor != null) return fromMedidor;
  return litrosEntrada(m.litros);
}

function litrosMelosaRow(m: MelosaRow): number {
  const fromMedidor = calcQuantidadeLitrosFromMedidores(
    m.melosa_medidor_acumulado_inicial_numero,
    m.melosa_medidor_acumulado_final_numero,
  );
  if (fromMedidor != null) return fromMedidor;
  return litrosEntrada(m.litros);
}

function medidorDetalheTanque(m: TanqueRow): string {
  const ini = m.medidor_tanque_numero_inicial;
  const fin = m.medidor_tanque_numero_final;
  if (ini == null && fin == null) return "";
  return `Medidor tanque: ${ini ?? "—"} → ${fin ?? "—"}`;
}

function medidorDetalheMelosa(m: MelosaRow): string {
  const ini = m.melosa_medidor_acumulado_inicial_numero;
  const fin = m.melosa_medidor_acumulado_final_numero;
  if (ini == null && fin == null) return "";
  return `Medidor acumulado: ${ini ?? "—"} → ${fin ?? "—"}`;
}

function parseMedidorNumero(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed) return null;
    const n = Number(trimmed.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function buildAnaliseAbastecimentosVsSobra(
  cronologico: ResumoEventoLinha[],
  rawPorKey: Map<string, MelosaRow>,
  limiteAceitavelPct: number,
): ResumoAbastecimentoAnalise[] {
  const out: ResumoAbastecimentoAnalise[] = [];
  let accRecebido = 0;
  let accAbast = 0;
  let accDevolvido = 0;

  const ordered = [...cronologico].sort(sortByData);

  ordered.forEach((ev) => {
    if (ev.tipo === "retirada_tanque") {
      accRecebido += ev.litros;
      return;
    }
    if (ev.tipo === "devolucao_tanque") {
      accDevolvido += ev.litros;
      return;
    }
    if (ev.tipo !== "abastecimento") return;

    const sobraAntes = accRecebido - accAbast - accDevolvido;
    const raw = rawPorKey.get(ev.key);
    const medIniStr = String(raw?.melosa_medidor_acumulado_inicial_numero ?? "").trim();
    const medFinStr = String(raw?.melosa_medidor_acumulado_final_numero ?? "").trim();
    const medIni = parseMedidorNumero(raw?.melosa_medidor_acumulado_inicial_numero);
    const medFin = parseMedidorNumero(raw?.melosa_medidor_acumulado_final_numero);

    let litrosParaEquipamento: number | null = null;
    if (medIni != null && medFin != null && medFin < medIni) {
      litrosParaEquipamento = medIni - medFin;
    }

    const litrosEfetivos = litrosParaEquipamento ?? ev.litros;
    const litrosSaidaMelosaAntesChegar = medIni != null ? sobraAntes - medIni : null;
    const litrosNaMelosaApos = medFin != null && medIni != null && medFin < medIni ? medFin : null;
    const sobraContabilApos = sobraAntes - litrosEfetivos;

    const saidaAnalise =
      litrosSaidaMelosaAntesChegar != null && litrosSaidaMelosaAntesChegar > 0.05
        ? calcSaidaMelosaAntesChegar(sobraAntes, litrosSaidaMelosaAntesChegar, limiteAceitavelPct)
        : null;

    const notas: string[] = [];
    const alertas: string[] = [];
    let status: ResumoAbastecimentoAnalise["status"] = "ok";

    if (litrosSaidaMelosaAntesChegar != null && litrosSaidaMelosaAntesChegar > 0.05 && saidaAnalise) {
      notas.push(
        `${fmtLitrosDashboard(litrosSaidaMelosaAntesChegar)} L saíram da melosa entre a sobra contábil (${fmtLitrosDashboard(sobraAntes)} L) e a leitura ao chegar (${fmtLitrosDashboard(medIni!)} L) — ${fmtPctDashboard(saidaAnalise.litrosSaidaPct)} da sobra.`,
      );
      notas.push(
        `Consumo aceitável do caminhão (gasolina/deslocamento): até ${fmtPctDashboard(limiteAceitavelPct)} da sobra = ${fmtLitrosDashboard(saidaAnalise.consumoGasolinaAceitavelLitros)} L.`,
      );
      if (saidaAnalise.status === "suspeita") {
        alertas.push(
          `Saída acima da margem: volume suspeito ${fmtLitrosDashboard(saidaAnalise.volumeSuspeitoLitros)} L (saída ${fmtLitrosDashboard(litrosSaidaMelosaAntesChegar)} L − aceitável ${fmtLitrosDashboard(saidaAnalise.consumoGasolinaAceitavelLitros)} L).`,
        );
        if (status === "ok") status = "atencao";
      }
    }

    if (litrosNaMelosaApos != null) {
      notas.push(
        `Após abastecer o equipamento, o medidor final (${fmtLitrosDashboard(litrosNaMelosaApos)} L) é o combustível que ficou na melosa.`,
      );
    }

    if (litrosParaEquipamento != null && Math.abs(litrosParaEquipamento - ev.litros) > 0.05) {
      alertas.push(
        `Litros do registo (${fmtLitrosDashboard(ev.litros)} L) difere do medidor ini − fin (${fmtLitrosDashboard(litrosParaEquipamento)} L).`,
      );
      status = "atencao";
    }
    if (medIni != null && medFin != null && medFin >= medIni) {
      alertas.push("Medidor final deve ser menor que o inicial (combustível saiu da melosa para o equipamento).");
      status = "inconsistente";
    }
    if (litrosEfetivos > sobraAntes + 0.05) {
      alertas.push(
        `Abastecimento (${fmtLitrosDashboard(litrosEfetivos)} L) maior que a sobra contábil antes (${fmtLitrosDashboard(sobraAntes)} L).`,
      );
      status = "inconsistente";
    }
    if (litrosSaidaMelosaAntesChegar != null && litrosSaidaMelosaAntesChegar < -0.05) {
      alertas.push(
        `Leitura ao chegar (${fmtLitrosDashboard(medIni!)} L) maior que a sobra contábil (${fmtLitrosDashboard(sobraAntes)} L) — conferir medidor ou registos anteriores.`,
      );
      status = "inconsistente";
    }

    out.push({
      key: ev.key,
      dataHoraFmt: ev.dataHoraFmt,
      equipamento: ev.equipamento,
      responsavel: ev.responsavel,
      sobraAntesLitros: sobraAntes,
      medidorInicial: medIniStr || "—",
      medidorFinal: medFinStr || "—",
      litrosParaEquipamento,
      litrosSaidaMelosaAntesChegar,
      limiteConsumoMelosaPct: limiteAceitavelPct,
      consumoGasolinaAceitavelLitros: saidaAnalise?.consumoGasolinaAceitavelLitros ?? null,
      litrosSaidaMelosaPct: saidaAnalise?.litrosSaidaPct ?? null,
      volumeSuspeitoSaidaLitros: saidaAnalise?.volumeSuspeitoLitros ?? null,
      statusSaidaAntesChegar: saidaAnalise?.status ?? "na",
      litrosNaMelosaApos,
      sobraContabilApos,
      litrosRegistro: ev.litros,
      notas,
      alertas,
      status,
    });

    accAbast += ev.litros;
  });

  return out;
}

function parseHorimetroNumero(v: unknown): { valor: number; unidade: string } | null {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const unidade = lower.includes("km") ? "km" : lower.includes("h") ? "h" : "";
  const numMatch = raw.replace(/\s/g, "").replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!numMatch) return null;
  const valor = Number(numMatch[0]);
  if (!Number.isFinite(valor)) return null;
  return { valor, unidade: unidade || "un." };
}

function sortByData(a: ResumoEventoLinha, b: ResumoEventoLinha): number {
  return a.dataHoraIso.localeCompare(b.dataHoraIso);
}

function buildAnaliseTrechos(
  retiradas: ResumoEventoLinha[],
  rawAbastecimentos: MelosaRow[],
): ResumoAnaliseTrecho[] {
  const out: ResumoAnaliseTrecho[] = [];
  const abastComHor = rawAbastecimentos
    .map((m) => {
      const horRaw =
        m.melosa_horimetro_equipamento_abastecido_numero ??
        (m.melosa_km_registro != null ? `${m.melosa_km_registro} km` : null) ??
        (m.melosa_km_retirada != null ? `${m.melosa_km_retirada} km` : null);
      const parsed = parseHorimetroNumero(horRaw);
      const litros = litrosMelosaRow(m);
      const d = parseDataHora(m.data_hora);
      return { m, horRaw: String(horRaw ?? "").trim(), parsed, litros, time: d?.getTime() ?? 0 };
    })
    .filter((x) => x.litros > 0 && x.parsed != null)
    .sort((a, b) => a.time - b.time);

  for (let i = 0; i < abastComHor.length; i += 1) {
    const cur = abastComHor[i];
    const prev = i > 0 ? abastComHor[i - 1] : null;
    const equip = String(cur.m.fornecedor_texto ?? "").trim() || "Equipamento";
    if (prev && prev.parsed && cur.parsed && prev.parsed.unidade === cur.parsed.unidade) {
      const delta = cur.parsed.valor - prev.parsed.valor;
      if (delta > 0) {
        out.push({
          label: `${prev.horRaw || "—"} → ${cur.horRaw || "—"} (${equip})`,
          horimetroInicio: prev.horRaw || "—",
          horimetroFim: cur.horRaw || "—",
          deltaHorimetro: delta,
          unidade: cur.parsed.unidade,
          litros: cur.litros,
          litrosPorUnidade: cur.litros / delta,
          observacao: `Entre dois abastecimentos: ${fmtLitrosDashboard(cur.litros)} L em ${fmtLitrosDashboard(delta)} ${cur.parsed.unidade}`,
        });
      }
    } else if (cur.parsed) {
      out.push({
        label: `Abastecimento — ${equip}`,
        horimetroInicio: cur.horRaw || "—",
        horimetroFim: "—",
        deltaHorimetro: null,
        unidade: cur.parsed.unidade,
        litros: cur.litros,
        litrosPorUnidade: null,
        observacao: "Primeiro registo com horímetro/hodômetro no período (sem trecho anterior para comparar).",
      });
    }
  }

  const retComHor = retiradas
    .map((r) => ({ r, parsed: parseHorimetroNumero(r.horimetro) }))
    .filter((x) => x.parsed != null);
  if (retComHor.length > 0 && abastComHor.length > 0) {
    const ultimaRet = retComHor[retComHor.length - 1].r;
    const primeiroAbast = abastComHor[0];
    if (ultimaRet && primeiroAbast.parsed) {
      out.unshift({
        label: "Retirada do tanque → 1.º abastecimento",
        horimetroInicio: ultimaRet.horimetro,
        horimetroFim: primeiroAbast.horRaw || "—",
        deltaHorimetro: null,
        unidade: primeiroAbast.parsed.unidade,
        litros: primeiroAbast.litros,
        litrosPorUnidade: null,
        observacao:
          "Horímetro da retirada (caminhão) e do equipamento podem ser de escalas diferentes — use os trechos entre abastecimentos consecutivos.",
      });
    }
  }

  return out;
}

function periodoLabel(filters: DashboardAggregateFilters): string {
  const fmt = (d: Date | null | undefined) =>
    d
      ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d)
      : "—";
  return `${fmt(filters.de)} a ${fmt(filters.ate)}`;
}

export function buildResumoAtivoMelosa(
  tanqueRows: MovimentoTanqueRow[],
  melosaRows: MovimentoMelosaRow[],
  filters: DashboardAggregateFilters,
  ativoPlaca: string,
  obras: Array<{ codigo: number; nome: string }>,
  devolvidoTotal: number,
  limiteAceitavelPct: number,
): ResumoAtivoMelosaPayload {
  const ativoNorm = ativoPlaca.trim().toUpperCase();
  const obrasMap = new Map(obras.map((o) => [o.codigo, o.nome]));

  const retiradas: ResumoEventoLinha[] = [];
  const abastecimentos: ResumoEventoLinha[] = [];
  const devolucoes: ResumoEventoLinha[] = [];
  const rawAbastecimentos: MelosaRow[] = [];
  const responsaveisSet = new Set<string>();

  (tanqueRows as TanqueRow[]).forEach((m, idx) => {
    if (!passesFilters(m, filters, ativoNorm)) return;
    const resp = fmtResponsavel(m);
    if (resp !== "—") responsaveisSet.add(resp);

    if (m.tipo === "RETIRADA_TANQUE") {
      const litros = litrosRetiradaTanqueRow(m);
      if (litros <= 0) return;
      const iso = String(m.data_hora ?? "");
      retiradas.push({
        key: `ret-${m.operation_id ?? m.id ?? idx}`,
        tipo: "retirada_tanque",
        tipoLabel: "Retirada do tanque",
        dataHoraIso: iso,
        dataHoraFmt: fmtDateBr(m.data_hora),
        litros,
        litrosFmt: `${fmtLitrosDashboard(litros)} L`,
        local: fmtLocal(m),
        horimetro: String(m.tanque_texto ?? "").trim() || "—",
        equipamento: String(m.fornecedor_texto ?? "").trim() || "—",
        responsavel: resp,
        obra: fmtObra(m, obrasMap),
        detalhe: [medidorDetalheTanque(m), m.combustivel_tipo ? `Insumo: ${m.combustivel_tipo}` : ""]
          .filter(Boolean)
          .join(" · "),
      });
    }

    if (m.tipo === "ENTRADA_TANQUE_OBRA") {
      const litros = litrosEntrada(m.litros);
      if (litros <= 0) return;
      const iso = String(m.data_hora ?? "");
      devolucoes.push({
        key: `dev-${m.operation_id ?? m.id ?? idx}`,
        tipo: "devolucao_tanque",
        tipoLabel: "Devolução ao tanque",
        dataHoraIso: iso,
        dataHoraFmt: fmtDateBr(m.data_hora),
        litros,
        litrosFmt: `${fmtLitrosDashboard(litros)} L`,
        local: fmtLocal(m),
        horimetro: "—",
        equipamento: "—",
        responsavel: resp,
        obra: fmtObra(m, obrasMap),
        detalhe: m.combustivel_tipo ? `Insumo: ${m.combustivel_tipo}` : "",
      });
    }
  });

  (melosaRows as MelosaRow[]).forEach((m, idx) => {
    if (!passesFilters(m, filters, ativoNorm)) return;
    const litros = litrosMelosaRow(m);
    if (litros <= 0) return;
    rawAbastecimentos.push(m);
    const resp = fmtResponsavel(m);
    if (resp !== "—") responsaveisSet.add(resp);
    const horimetro =
      String(m.melosa_horimetro_equipamento_abastecido_numero ?? "").trim() ||
      (m.melosa_km_registro != null ? `${m.melosa_km_registro} km` : "") ||
      (m.melosa_km_retirada != null ? `${m.melosa_km_retirada} km` : "") ||
      "—";
    const motorista = String(m.melosa_motorista_equipamento_abastecido ?? "").trim();
    const iso = String(m.data_hora ?? "");
    abastecimentos.push({
      key: `ab-${m.operation_id ?? m.id ?? idx}`,
      tipo: "abastecimento",
      tipoLabel: "Abastecimento equipamento",
      dataHoraIso: iso,
      dataHoraFmt: fmtDateBr(m.data_hora),
      litros,
      litrosFmt: `${fmtLitrosDashboard(litros)} L`,
      local: fmtLocal(m),
      horimetro,
      equipamento: String(m.fornecedor_texto ?? "").trim() || "—",
      responsavel: resp,
      obra: fmtObra(m, obrasMap),
      detalhe: [medidorDetalheMelosa(m), motorista ? `Operador: ${motorista}` : ""].filter(Boolean).join(" · "),
    });
  });

  retiradas.sort(sortByData);
  abastecimentos.sort(sortByData);
  devolucoes.sort(sortByData);
  const cronologico = [...retiradas, ...abastecimentos, ...devolucoes].sort(sortByData);

  const rawPorKey = new Map<string, MelosaRow>();
  (melosaRows as MelosaRow[]).forEach((m, idx) => {
    if (!passesFilters(m, filters, ativoNorm)) return;
    const key = `ab-${m.operation_id ?? m.id ?? idx}`;
    rawPorKey.set(key, m);
  });

  const retiradaTanque = retiradas.reduce((s, e) => s + e.litros, 0);
  const abast = abastecimentos.reduce((s, e) => s + e.litros, 0);
  const devolvido = devolvidoTotal;
  const sobra = retiradaTanque - abast - devolvido;

  const fechamento = calcularCombustivelControle({
    entradaTanque: 0,
    retiradaMelosa: retiradaTanque,
    abastecimentosEquipamentos: abast,
    devolvidoTanque: devolvido,
    limiteAceitavelPct,
  });

  return {
    ativoPlaca: ativoPlaca.trim(),
    periodoLabel: periodoLabel(filters),
    retiradas,
    abastecimentos,
    devolucoes,
    cronologico,
    totais: {
      retiradaTanque,
      abastecimentos: abast,
      devolvido,
      sobra,
      volumeJustificado: fechamento.volumeJustificado,
      diferenca: fechamento.diferencaLitros,
      diferencaPct: fechamento.diferencaPct,
      volumeSuspeito: fechamento.volumeSuspeito,
      status: fechamento.status,
    },
    analiseTrechos: buildAnaliseTrechos(retiradas, rawAbastecimentos),
    analiseAbastecimentos: buildAnaliseAbastecimentosVsSobra(cronologico, rawPorKey, limiteAceitavelPct),
    responsaveis: Array.from(responsaveisSet).sort((a, b) => a.localeCompare(b, "pt-BR")),
  };
}
