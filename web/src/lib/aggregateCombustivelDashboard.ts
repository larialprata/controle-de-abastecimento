import { calcQuantidadeLitrosRetiradaTanqueFromMedidores } from "./descarbonizeExcel";

export type MovimentoRowBase = {
  usuario_id?: string;
  usuario_full_name?: string | null;
  placa_texto?: string | null;
  placa_caminhao?: string | null;
  ativo_melosa_texto?: string | null;
};

export type MovimentoTanqueRow = MovimentoRowBase & {
  tipo?: string;
  obra_codigo?: number;
  data_hora?: string;
  litros?: number;
  tanque_numero?: number | string | null;
  medidor_tanque_numero_inicial?: string | null;
  medidor_tanque_numero_final?: string | null;
  tanque_quantidade_abastecida?: string | null;
};

export type TanquePrincipalAggregate = {
  /** Entrada de combustível novo (nota/fornecedor), sem placa de retirada melosa */
  entradaTanque: number;
  retiradaMelosa: number;
  /** ENTRADA_TANQUE_OBRA com mesma placa/ativo de uma RETIRADA_TANQUE no período filtrado */
  devolvidoMelosaAutomatico: number;
  qtdEntradas: number;
  qtdRetiradasTanque: number;
  qtdDevolucoesMelosa: number;
};

export type MovimentoMelosaRow = MovimentoRowBase & {
  obra_codigo?: number;
  data_hora?: string;
  melosa_quantidade_abastecida?: string | null;
  litros?: number;
};

export type DashboardAggregateFilters = {
  de?: Date | null;
  ate?: Date | null;
  obraCodigo?: number | null;
  usuarioId?: string | null;
  /** Placa/ativo do caminhão-melosa (melosa_movimentacoes.ativo_melosa_texto) */
  ativoMelosa?: string | null;
};

export type DashboardUsuarioOption = {
  id: string;
  nome: string;
};

export type DashboardAggregate = {
  entradaTanque: number;
  retiradaMelosa: number;
  abastecimentosEquipamentos: number;
  qtdEntradas: number;
  qtdRetiradasTanque: number;
  qtdAbastecimentosMelosa: number;
};

function parseDataHora(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function inPeriod(dataHora: unknown, filters: DashboardAggregateFilters): boolean {
  const d = parseDataHora(dataHora);
  if (!d) return false;
  if (filters.de && d < startOfDay(filters.de)) return false;
  if (filters.ate && d > endOfDay(filters.ate)) return false;
  return true;
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

function matchObra(obraCodigo: unknown, filterObra: number | null | undefined): boolean {
  if (filterObra == null) return true;
  return obraCodigo === filterObra;
}

function matchUsuario(row: MovimentoRowBase, usuarioId: string | null | undefined): boolean {
  if (!usuarioId) return true;
  return row.usuario_id === usuarioId;
}

function normPlaca(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toUpperCase();
}

export function placaAtivoMelosa(row: MovimentoRowBase): string {
  const p = normPlaca(row.ativo_melosa_texto ?? row.placa_texto);
  if (p) return p;
  return normPlaca(row.placa_caminhao);
}

export function passesDashboardFilters(
  row: MovimentoRowBase & { obra_codigo?: number; data_hora?: string },
  filters: DashboardAggregateFilters,
): boolean {
  return (
    inPeriod(row.data_hora, filters) &&
    matchObra(row.obra_codigo, filters.obraCodigo) &&
    matchUsuario(row, filters.usuarioId)
  );
}

function passesCommonFilters(
  row: MovimentoRowBase & { obra_codigo?: number; data_hora?: string },
  filters: DashboardAggregateFilters,
): boolean {
  return passesDashboardFilters(row, filters);
}

export function parseTanqueNumero(v: unknown): 1 | 2 | null {
  if (v === 1 || v === "1") return 1;
  if (v === 2 || v === "2") return 2;
  return null;
}

function matchTanqueNumero(row: MovimentoTanqueRow, tanqueNumero: 1 | 2 | null | undefined): boolean {
  if (tanqueNumero == null) return true;
  return parseTanqueNumero(row.tanque_numero) === tanqueNumero;
}

function litrosEntradaTanque(litros: unknown): number {
  if (typeof litros === "number" && Number.isFinite(litros) && litros > 0) return litros;
  return 0;
}

function litrosRetiradaTanque(row: MovimentoTanqueRow): number {
  const fromQuantidade = parseLitrosField(row.tanque_quantidade_abastecida);
  if (fromQuantidade != null && fromQuantidade > 0) return fromQuantidade;
  const fromMedidor = calcQuantidadeLitrosRetiradaTanqueFromMedidores(
    row.medidor_tanque_numero_inicial,
    row.medidor_tanque_numero_final,
  );
  if (fromMedidor != null) return fromMedidor;
  if (typeof row.litros === "number" && Number.isFinite(row.litros) && row.litros > 0) return row.litros;
  return 0;
}

function parseLitrosField(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed) return null;
    const n = Number(trimmed.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function litrosFromMelosaRow(litros: unknown, quantidade: unknown): number {
  const fromQuantidade = parseLitrosField(quantidade);
  if (fromQuantidade != null && fromQuantidade > 0) return fromQuantidade;
  const parsed = parseLitrosField(litros);
  if (parsed != null && parsed > 0) return parsed;
  return 0;
}

/** Placas/ativos usados em retiradas do tanque (caminhão-melosa) no conjunto filtrado. */
export function buildPlacasRetiradaTanqueMelosa(
  tanqueRows: MovimentoTanqueRow[],
  filters: DashboardAggregateFilters,
  tanqueNumero?: 1 | 2 | null,
): Set<string> {
  const placas = new Set<string>();
  tanqueRows.forEach((m) => {
    if (m.tipo !== "RETIRADA_TANQUE") return;
    if (!passesCommonFilters(m, filters)) return;
    if (!matchTanqueNumero(m, tanqueNumero)) return;
    const placa = placaAtivoMelosa(m);
    if (placa) placas.add(placa);
  });
  return placas;
}

export function aggregateTanquePrincipal(
  tanqueRows: MovimentoTanqueRow[],
  filters: DashboardAggregateFilters = {},
  tanqueNumero?: 1 | 2 | null,
): TanquePrincipalAggregate {
  let entradaTanque = 0;
  let retiradaMelosa = 0;
  let devolvidoMelosaAutomatico = 0;
  let qtdEntradas = 0;
  let qtdRetiradasTanque = 0;
  let qtdDevolucoesMelosa = 0;

  const placasRetiradaMelosa = buildPlacasRetiradaTanqueMelosa(tanqueRows, filters, tanqueNumero);

  tanqueRows.forEach((m) => {
    if (!passesCommonFilters(m, filters)) return;
    if (!matchTanqueNumero(m, tanqueNumero)) return;

    if (m.tipo === "ENTRADA_TANQUE_OBRA") {
      const L = litrosEntradaTanque(m.litros);
      if (L <= 0) return;
      const placa = placaAtivoMelosa(m);
      const isDevolucaoMelosa = placa.length > 0 && placasRetiradaMelosa.has(placa);
      if (isDevolucaoMelosa) {
        devolvidoMelosaAutomatico += L;
        qtdDevolucoesMelosa += 1;
      } else {
        entradaTanque += L;
        qtdEntradas += 1;
      }
    }

    if (m.tipo === "RETIRADA_TANQUE") {
      const L = litrosRetiradaTanque(m);
      if (L > 0) {
        retiradaMelosa += L;
        qtdRetiradasTanque += 1;
      }
    }
  });

  return {
    entradaTanque,
    retiradaMelosa,
    devolvidoMelosaAutomatico,
    qtdEntradas,
    qtdRetiradasTanque,
    qtdDevolucoesMelosa,
  };
}

export type DashboardDevolvidoResumo = {
  automatico: number;
  manual: number;
  total: number;
  qtdDevolucoes: number;
  usaManual: boolean;
};

/** Devolvido = entradas com placa da melosa (auto) ou valor manual se preenchido. */
export function resolveDevolvidoTanque(
  devolvidoAutomatico: number,
  devolvidoManualStr: string,
  qtdDevolucoes: number,
): DashboardDevolvidoResumo {
  const trimmed = devolvidoManualStr.trim();
  const manualParsed = trimmed ? Number(trimmed.replace(",", ".")) : NaN;
  const usaManual = trimmed.length > 0 && Number.isFinite(manualParsed) && manualParsed >= 0;
  const manual = usaManual ? manualParsed : 0;
  const total = usaManual ? manual : devolvidoAutomatico;
  return {
    automatico: devolvidoAutomatico,
    manual,
    total,
    qtdDevolucoes,
    usaManual,
  };
}

export type MelosaAtivoAggregate = {
  recebidoDoTanque: number;
  abastecimentosEquipamentos: number;
  devolvidoMelosaAutomatico: number;
  qtdRetiradasTanque: number;
  qtdAbastecimentosMelosa: number;
  qtdDevolucoesMelosa: number;
};

/** Métricas da melosa para um ativo/placa (retirada tanque + abastecimentos + devolução). */
export function aggregateMelosaPorAtivo(
  tanqueRows: MovimentoTanqueRow[],
  melosaRows: MovimentoMelosaRow[],
  filters: DashboardAggregateFilters,
  ativoPlaca: string,
): MelosaAtivoAggregate {
  const ativoNorm = normPlaca(ativoPlaca);
  let recebidoDoTanque = 0;
  let abastecimentosEquipamentos = 0;
  let devolvidoMelosaAutomatico = 0;
  let qtdRetiradasTanque = 0;
  let qtdAbastecimentosMelosa = 0;
  let qtdDevolucoesMelosa = 0;

  tanqueRows.forEach((m) => {
    if (!passesCommonFilters(m, filters)) return;
    if (placaAtivoMelosa(m) !== ativoNorm) return;

    if (m.tipo === "RETIRADA_TANQUE") {
      const L = litrosRetiradaTanque(m);
      if (L > 0) {
        recebidoDoTanque += L;
        qtdRetiradasTanque += 1;
      }
    }

    if (m.tipo === "ENTRADA_TANQUE_OBRA") {
      const L = litrosEntradaTanque(m.litros);
      if (L > 0) {
        devolvidoMelosaAutomatico += L;
        qtdDevolucoesMelosa += 1;
      }
    }
  });

  melosaRows.forEach((m) => {
    if (!passesCommonFilters(m, filters)) return;
    if (placaAtivoMelosa(m) !== ativoNorm) return;

    const L = litrosFromMelosaRow(m.litros, m.melosa_quantidade_abastecida);
    if (L > 0) {
      abastecimentosEquipamentos += L;
      qtdAbastecimentosMelosa += 1;
    }
  });

  return {
    recebidoDoTanque,
    abastecimentosEquipamentos,
    devolvidoMelosaAutomatico,
    qtdRetiradasTanque,
    qtdAbastecimentosMelosa,
    qtdDevolucoesMelosa,
  };
}

export function aggregateCombustivelDashboard(
  tanqueRows: MovimentoTanqueRow[],
  melosaRows: MovimentoMelosaRow[],
  filters: DashboardAggregateFilters = {},
): DashboardAggregate {
  const tanqueAgg = aggregateTanquePrincipal(tanqueRows, filters, null);
  let abastecimentosEquipamentos = 0;
  let qtdAbastecimentosMelosa = 0;

  melosaRows.forEach((m) => {
    if (!passesCommonFilters(m, filters)) return;

    const L = litrosFromMelosaRow(m.litros, m.melosa_quantidade_abastecida);
    if (L > 0) {
      abastecimentosEquipamentos += L;
      qtdAbastecimentosMelosa += 1;
    }
  });

  return {
    entradaTanque: tanqueAgg.entradaTanque,
    retiradaMelosa: tanqueAgg.retiradaMelosa,
    abastecimentosEquipamentos,
    qtdEntradas: tanqueAgg.qtdEntradas,
    qtdRetiradasTanque: tanqueAgg.qtdRetiradasTanque,
    qtdAbastecimentosMelosa,
  };
}

/** Tanques (1 ou 2) presentes nos movimentos de tanque/obra carregados. */
export function listDashboardTanques(tanqueRows: MovimentoTanqueRow[]): Array<1 | 2> {
  const set = new Set<1 | 2>();
  tanqueRows.forEach((m) => {
    const n = parseTanqueNumero(m.tanque_numero);
    if (n != null) set.add(n);
  });
  return Array.from(set).sort((a, b) => a - b);
}

export function defaultPeriodoMesAtual(): { de: Date; ate: Date } {
  const ate = new Date();
  const de = new Date(ate.getFullYear(), ate.getMonth(), 1);
  return { de, ate };
}

export function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateInputValue(v: string): Date | null {
  if (!v.trim()) return null;
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Opções de utilizador presentes nos dados carregados (tanque + melosa). */
export function listDashboardUsuarios(
  tanqueRows: MovimentoTanqueRow[],
  melosaRows: MovimentoMelosaRow[],
): DashboardUsuarioOption[] {
  const map = new Map<string, string>();
  const add = (row: MovimentoRowBase) => {
    const id = typeof row.usuario_id === "string" ? row.usuario_id.trim() : "";
    if (!id) return;
    const nome =
      typeof row.usuario_full_name === "string" && row.usuario_full_name.trim()
        ? row.usuario_full_name.trim()
        : id.slice(0, 8);
    if (!map.has(id)) map.set(id, nome);
  };
  tanqueRows.forEach(add);
  melosaRows.forEach(add);
  return Array.from(map.entries())
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Placas/ativos da melosa (retiradas tanque + registos melosa). */
export function listDashboardAtivosMelosa(
  tanqueRows: MovimentoTanqueRow[],
  melosaRows: MovimentoMelosaRow[],
): string[] {
  const set = new Set<string>();
  tanqueRows.forEach((m) => {
    if (m.tipo !== "RETIRADA_TANQUE") return;
    const p = placaAtivoMelosa(m);
    if (p) set.add(p);
  });
  melosaRows.forEach((m) => {
    const p = placaAtivoMelosa(m);
    if (p) set.add(p);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}
