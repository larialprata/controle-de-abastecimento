import { Workbook, type Cell, type Worksheet } from "exceljs";

export const DESCARBONIZE_TEMPLATE_URL = "/templates/planilha-melosa-descarbonize.xlsx";

const DATA_START_ROW = 2;
const TEMPLATE_COL_COUNT = 13;

export const DESCARBONIZE_SUBCATEGORIA_DADOS = "Transporte rodoviário – por tipo de combustível";
export const DESCARBONIZE_CATEGORIA_MOVEL =
  "Emissões diretas de fontes móveis com motor de combustão interna";
export const DESCARBONIZE_CATEGORIA_ESTACIONARIA =
  "Emissões diretas de fontes estácionarias com motor de combustão interna";
export const DESCARBONIZE_EVIDENCIA = "Sim, tenho evidência";
export const DESCARBONIZE_RECEITA_DIFERENTE = "Não";

export type DescarbonizeExcelColumnKey =
  | "unidade"
  | "categoria"
  | "subcategoria"
  | "dataInicio"
  | "dataFim"
  | "fator"
  | "quantidade"
  | "detalheUm"
  | "detalheDois"
  | "comentarios"
  | "evidencia"
  | "percentualReceita"
  | "receitaDescarbonize";

export type DescarbonizeExcelColumnMap = Partial<Record<DescarbonizeExcelColumnKey, number>>;

export type DescarbonizeExcelRowInput = {
  obraCodigo?: number;
  obraNome?: string | null;
  /** MOVEL | ESTACIONARIA ou texto completo da categoria */
  categoriaDados?: string | null;
  dataHora?: string;
  insumo?: string | null;
  medidorInicial?: string | null;
  medidorFinal?: string | null;
  /** Usado quando não há medidor (ex.: litros direto) */
  quantidadeLitros?: number | null;
  placaTexto?: string | null;
};

function normHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function buildDescarbonizeColumnMapFromSheet(sheet: Worksheet): DescarbonizeExcelColumnMap {
  const map: DescarbonizeExcelColumnMap = {};
  const headerRow = sheet.getRow(1);

  for (let col = 1; col <= TEMPLATE_COL_COUNT; col += 1) {
    const text = normHeader(headerRow.getCell(col).value);
    if (!text) continue;

    if (text.includes("unidade") && text.includes("neg")) map.unidade = col;
    else if (text.includes("subcategoria")) map.subcategoria = col;
    else if (text.includes("categoria") && text.includes("dado")) map.categoria = col;
    else if (text.includes("data") && text.includes("inic")) map.dataInicio = col;
    else if (text.includes("data") && text.includes("fim")) map.dataFim = col;
    else if (text.includes("fator") && text.includes("emiss")) map.fator = col;
    else if (text.includes("quantidade")) map.quantidade = col;
    else if (text.includes("detalhe") && text.includes("um")) map.detalheUm = col;
    else if (text.includes("detalhe") && (text.includes("dois") || text.includes("2"))) map.detalheDois = col;
    else if (text.includes("coment")) map.comentarios = col;
    else if (text.includes("evid")) map.evidencia = col;
    else if (text.includes("percentual") && text.includes("receita")) map.percentualReceita = col;
    else if (text.includes("receita") && text.includes("descarbon")) map.receitaDescarbonize = col;
  }

  return map;
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

/** Melosa — litros = |final − inicial| (registos novos: final > inicial; legado: inicial > final). */
export function calcQuantidadeLitrosFromMedidores(inicial: unknown, final: unknown): number | null {
  const ini = parseMedidorNumero(inicial);
  const fin = parseMedidorNumero(final);
  if (ini == null || fin == null || ini === fin) return null;
  const diff = fin > ini ? fin - ini : ini - fin;
  return Number.isFinite(diff) && diff > 0 ? diff : null;
}

/** Retirada do tanque — medidor acumulado sobe: final − inicial (ex.: 50 → 5000 = 4950 L). */
export function calcQuantidadeLitrosRetiradaTanqueFromMedidores(
  inicial: unknown,
  final: unknown,
): number | null {
  const ini = parseMedidorNumero(inicial);
  const fin = parseMedidorNumero(final);
  if (ini == null || fin == null || fin <= ini) return null;
  const diff = fin - ini;
  return Number.isFinite(diff) && diff > 0 ? diff : null;
}

/** Litros na movimentação de tanque: entrada usa `litros`; saída usa quantidade abastecida. */
export function resolveLitrosMovimentoTanque(row: {
  tipo?: string;
  litros?: unknown;
  tanque_quantidade_abastecida?: unknown;
  medidor_tanque_numero_inicial?: unknown;
  medidor_tanque_numero_final?: unknown;
}): number | null {
  if (row.tipo === "RETIRADA_TANQUE") {
    const fromQuantidade = parseMedidorNumero(row.tanque_quantidade_abastecida);
    if (fromQuantidade != null && fromQuantidade > 0) return fromQuantidade;
    const fromMedidor = calcQuantidadeLitrosRetiradaTanqueFromMedidores(
      row.medidor_tanque_numero_inicial,
      row.medidor_tanque_numero_final,
    );
    if (fromMedidor != null) return fromMedidor;
  }
  const litros = row.litros;
  if (typeof litros === "number" && Number.isFinite(litros) && litros > 0) return litros;
  return null;
}

function parseDataHora(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDataExcel(v: unknown): string {
  const d = parseDataHora(v);
  if (!d) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function fmtUnidadeNegocio(row: DescarbonizeExcelRowInput): string {
  const cod = row.obraCodigo;
  const nome = row.obraNome != null ? String(row.obraNome).trim() : "";
  if (cod != null && nome) return `${cod} - ${nome}`;
  if (cod != null) return String(cod);
  return nome || "";
}

export function fmtCategoriaDados(categoria: unknown): string {
  const raw = String(categoria ?? "").trim();
  if (!raw) return DESCARBONIZE_CATEGORIA_ESTACIONARIA;
  const upper = raw.toUpperCase();
  if (upper === "MOVEL") return DESCARBONIZE_CATEGORIA_MOVEL;
  if (upper === "ESTACIONARIA") return DESCARBONIZE_CATEGORIA_ESTACIONARIA;
  if (raw.includes("móveis") || raw.includes("moveis")) return DESCARBONIZE_CATEGORIA_MOVEL;
  if (raw.includes("estácion") || raw.includes("estacion")) return DESCARBONIZE_CATEGORIA_ESTACIONARIA;
  return raw;
}

export function fmtFatorEmissao(insumo: unknown): string {
  if (insumo == null || !String(insumo).trim()) return "";
  const upper = String(insumo).trim().toUpperCase();
  if (upper === "DIESEL" || upper === "DIESEL_S10") return "Diesel";
  if (upper === "GASOLINA") return "Gasolina";
  if (upper === "ALCOOL" || upper === "ÁLCOOL") return "Álcool";
  return String(insumo).replaceAll("_", " ");
}

function resolveQuantidade(row: DescarbonizeExcelRowInput): number | null {
  const litros = row.quantidadeLitros;
  if (typeof litros === "number" && Number.isFinite(litros) && litros > 0) return litros;
  const melosa = calcQuantidadeLitrosFromMedidores(row.medidorInicial, row.medidorFinal);
  if (melosa != null) return melosa;
  return calcQuantidadeLitrosRetiradaTanqueFromMedidores(row.medidorInicial, row.medidorFinal);
}

function setCellValueOnly(cell: Cell, value: unknown, numFmt?: string) {
  cell.value = value as never;
  if (numFmt) cell.numFmt = numFmt;
}

function ensureDataRowCapacity(sheet: Worksheet, dataRowCount: number) {
  const lastNeeded = DATA_START_ROW + dataRowCount - 1;
  while (sheet.rowCount < lastNeeded) {
    const ref = Math.min(sheet.rowCount, 11);
    sheet.duplicateRow(ref >= DATA_START_ROW ? ref : DATA_START_ROW, 1, true);
  }
}

function clearDataAreaValues(sheet: Worksheet, dataRowCount: number) {
  const lastClear = Math.max(sheet.rowCount, DATA_START_ROW + dataRowCount - 1);
  for (let r = DATA_START_ROW; r <= lastClear; r += 1) {
    for (let c = 1; c <= TEMPLATE_COL_COUNT; c += 1) {
      sheet.getRow(r).getCell(c).value = null;
    }
  }
}

function templateStyleRowForIndex(dataIndex: number): number {
  const natural = DATA_START_ROW + dataIndex;
  if (natural <= 11) return natural;
  return dataIndex % 2 === 0 ? 4 : 3;
}

function applyRowStyleFromTemplate(sheet: Worksheet, targetRow: number, dataIndex: number) {
  const sourceRow = templateStyleRowForIndex(dataIndex);
  if (sourceRow > sheet.rowCount || sourceRow === targetRow) return;
  const src = sheet.getRow(sourceRow);
  const dst = sheet.getRow(targetRow);
  dst.height = src.height;
  src.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    dst.getCell(colNumber).style = cell.style;
  });
}

function writeDataRow(
  sheet: Worksheet,
  excelRow: number,
  dataIndex: number,
  row: DescarbonizeExcelRowInput,
  cols: DescarbonizeExcelColumnMap,
) {
  if (excelRow > 11) {
    applyRowStyleFromTemplate(sheet, excelRow, dataIndex);
  }

  const data = fmtDataExcel(row.dataHora);
  const quantidade = resolveQuantidade(row);
  const r = sheet.getRow(excelRow);

  const put = (key: DescarbonizeExcelColumnKey, value: unknown, numFmt?: string) => {
    const col = cols[key];
    if (col == null) return;
    setCellValueOnly(r.getCell(col), value, numFmt);
  };

  put("unidade", fmtUnidadeNegocio(row));
  put("categoria", fmtCategoriaDados(row.categoriaDados));
  put("subcategoria", DESCARBONIZE_SUBCATEGORIA_DADOS);
  put("dataInicio", data);
  put("dataFim", data);
  put("fator", fmtFatorEmissao(row.insumo));
  put("quantidade", quantidade ?? "", quantidade != null ? "#,##0.00" : undefined);
  put("detalheUm", "");
  put("detalheDois", row.placaTexto != null ? String(row.placaTexto).trim() : "");
  put("comentarios", "");
  put("evidencia", DESCARBONIZE_EVIDENCIA);
  put("percentualReceita", DESCARBONIZE_RECEITA_DIFERENTE);
  put("receitaDescarbonize", 0);
}

function sumQuantidadeLitros(rows: DescarbonizeExcelRowInput[]): number {
  return rows.reduce((acc, row) => {
    const q = resolveQuantidade(row);
    return acc + (q ?? 0);
  }, 0);
}

function writeQuantidadeTotalRow(
  sheet: Worksheet,
  excelRow: number,
  total: number,
  cols: DescarbonizeExcelColumnMap,
  styleIndex: number,
) {
  if (excelRow > 11) {
    applyRowStyleFromTemplate(sheet, excelRow, styleIndex);
  }

  const r = sheet.getRow(excelRow);
  const labelCol = cols.fator ?? cols.dataFim ?? cols.unidade;
  const qCol = cols.quantidade;

  if (labelCol != null) {
    const labelCell = r.getCell(labelCol);
    setCellValueOnly(labelCell, "Total (L)");
    const prevFont = labelCell.font ?? {};
    labelCell.font = { ...prevFont, bold: true };
  }

  if (qCol != null) {
    const sumCell = r.getCell(qCol);
    setCellValueOnly(sumCell, total, "#,##0.00");
    const prevFont = sumCell.font ?? {};
    sumCell.font = { ...prevFont, bold: true };
  }
}

export type BuildDescarbonizeWorkbookOptions = {
  /** Linha extra no fim com a soma da coluna Quantidade (L) */
  appendQuantidadeTotal?: boolean;
};

async function loadTemplateWorkbook(templateUrl: string): Promise<Workbook> {
  const res = await fetch(templateUrl);
  if (!res.ok) {
    throw new Error(
      "Planilha modelo não encontrada. Coloque o arquivo em web/public/templates/planilha-melosa-descarbonize.xlsx",
    );
  }
  const workbook = new Workbook();
  await workbook.xlsx.load(await res.arrayBuffer());
  return workbook;
}

export async function buildDescarbonizeWorkbook(
  rows: DescarbonizeExcelRowInput[],
  templateUrl = DESCARBONIZE_TEMPLATE_URL,
  options?: BuildDescarbonizeWorkbookOptions,
): Promise<Workbook> {
  const workbook = await loadTemplateWorkbook(templateUrl);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error("A planilha modelo não contém nenhuma aba.");
  }

  const appendTotal = Boolean(options?.appendQuantidadeTotal && rows.length > 0);
  const rowSlots = rows.length + (appendTotal ? 1 : 0);

  const columnMap = buildDescarbonizeColumnMapFromSheet(sheet);
  ensureDataRowCapacity(sheet, rowSlots);
  clearDataAreaValues(sheet, rowSlots);

  rows.forEach((row, idx) => {
    writeDataRow(sheet, DATA_START_ROW + idx, idx, row, columnMap);
  });

  if (appendTotal) {
    writeQuantidadeTotalRow(
      sheet,
      DATA_START_ROW + rows.length,
      sumQuantidadeLitros(rows),
      columnMap,
      rows.length,
    );
  }

  return workbook;
}

export async function downloadDescarbonizeExcel(
  rows: DescarbonizeExcelRowInput[],
  filenamePrefix = "descarbonize",
  templateUrl = DESCARBONIZE_TEMPLATE_URL,
  options?: BuildDescarbonizeWorkbookOptions,
): Promise<void> {
  const workbook = await buildDescarbonizeWorkbook(rows, templateUrl, options);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dataTag = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${filenamePrefix}-${dataTag}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
