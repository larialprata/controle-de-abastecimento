import ExcelJS from "exceljs";

export type MelosaBiResumoRow = {
  empresa?: string | null;
  obraCodigo?: number;
  obraNome?: string | null;
  dataHora?: string;
  ativoMelosa?: string | null;
  ativoEquipamento?: string | null;
  insumo?: string | null;
  quantidadeLitros?: number | null;
  responsavelEquipamento?: string | null;
  responsavelMelosa?: string | null;
  fotoQuantidadeUrl?: string | null;
  local?: string | null;
};

const COLUMNS = [
  { header: "Data/Horário", key: "dataHora", width: 18 },
  { header: "Obra", key: "obra", width: 26 },
  { header: "Empresa", key: "empresa", width: 14 },
  { header: "Responsável Melosa", key: "responsavelMelosa", width: 20 },
  { header: "Ativo Melosa", key: "ativoMelosa", width: 14 },
  { header: "Responsável Equipamento", key: "responsavelEquipamento", width: 22 },
  { header: "Ativo Equipamento", key: "ativoEquipamento", width: 24 },
  { header: "Insumo", key: "insumo", width: 12 },
  { header: "Quantidade", key: "quantidade", width: 12 },
  { header: "Foto Quantidade Abastecida", key: "fotoQuantidade", width: 20 },
  { header: "Local", key: "local", width: 40 },
] as const;

const COL_COUNT = COLUMNS.length;
const QUANTIDADE_COL = COLUMNS.findIndex((c) => c.key === "quantidade") + 1;

const MONTH_LABELS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
] as const;

const COLORS = {
  titleBg: "FF0F172A",
  titleFg: "FFFFFFFF",
  empresaBg: "FF1E40AF",
  empresaFg: "FFFFFFFF",
  headerBg: "FF334155",
  headerFg: "FFFFFFFF",
  separatorBg: "FFE2E8F0",
  zebra: "FFF8FAFC",
  totalBg: "FFDBEAFE",
  resumoBg: "FF0F766E",
  resumoHeaderBg: "FF115E59",
  link: "FF1D4ED8",
};

function fmtDataHoraBr(v: unknown): string {
  if (!v) return "";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function fmtObra(row: MelosaBiResumoRow): string {
  const cod = row.obraCodigo;
  const nome = row.obraNome != null ? String(row.obraNome).trim() : "";
  if (cod != null && nome) return `${cod} · ${nome}`;
  if (cod != null) return String(cod);
  return nome || "—";
}

function groupRowsByEmpresa(rows: MelosaBiResumoRow[]): { empresa: string; rows: MelosaBiResumoRow[] }[] {
  const order: string[] = [];
  const map = new Map<string, MelosaBiResumoRow[]>();

  rows.forEach((row) => {
    const label = row.empresa?.trim() || "Sem empresa";
    if (!map.has(label)) {
      order.push(label);
      map.set(label, []);
    }
    map.get(label)!.push(row);
  });

  return order.map((empresa) => ({ empresa, rows: map.get(empresa) ?? [] }));
}

function sortEmpresaGroups(groups: { empresa: string; rows: MelosaBiResumoRow[] }[]) {
  return [...groups].sort((a, b) => {
    if (a.empresa === "Sem empresa") return 1;
    if (b.empresa === "Sem empresa") return -1;
    return a.empresa.localeCompare(b.empresa, "pt-BR", { sensitivity: "base" });
  });
}

function sumQuantidadeLitros(rows: MelosaBiResumoRow[]): number {
  return rows.reduce((sum, row) => {
    if (typeof row.quantidadeLitros === "number" && Number.isFinite(row.quantidadeLitros)) {
      return sum + row.quantidadeLitros;
    }
    return sum;
  }, 0);
}

function writeResumoSection(sheet: ExcelJS.Worksheet, rowIndex: number, rows: MelosaBiResumoRow[]): number {
  const groups = sortEmpresaGroups(groupRowsByEmpresa(rows));
  const totalLitros = sumQuantidadeLitros(rows);

  mergeAndStyle(sheet, rowIndex, "Resumo geral", {
    bg: COLORS.resumoBg,
    fg: COLORS.titleFg,
    fontSize: 12,
    height: 26,
  });
  rowIndex += 1;

  const headerRow = sheet.getRow(rowIndex);
  headerRow.height = 24;
  sheet.mergeCells(rowIndex, 1, rowIndex, 7);
  sheet.mergeCells(rowIndex, 8, rowIndex, 9);
  sheet.mergeCells(rowIndex, 10, rowIndex, COL_COUNT);

  const empresaHeader = headerRow.getCell(1);
  empresaHeader.value = "Empresa do equipamento";
  empresaHeader.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.headerFg } };
  empresaHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.resumoHeaderBg } };
  empresaHeader.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

  const registrosHeader = headerRow.getCell(8);
  registrosHeader.value = "Registros";
  registrosHeader.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.headerFg } };
  registrosHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.resumoHeaderBg } };
  registrosHeader.alignment = { vertical: "middle", horizontal: "center", wrapText: true };

  const quantidadeHeader = headerRow.getCell(10);
  quantidadeHeader.value = "Quantidade (L)";
  quantidadeHeader.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.headerFg } };
  quantidadeHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.resumoHeaderBg } };
  quantidadeHeader.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  applyBorder(headerRow);
  rowIndex += 1;

  groups.forEach((group, idx) => {
    const dataRow = sheet.getRow(rowIndex);
    dataRow.height = 22;
    const zebra = idx % 2 === 1;
    const litros = sumQuantidadeLitros(group.rows);
    const fill = zebra ? COLORS.zebra : "FFFFFFFF";

    sheet.mergeCells(rowIndex, 1, rowIndex, 7);
    sheet.mergeCells(rowIndex, 8, rowIndex, 9);
    sheet.mergeCells(rowIndex, 10, rowIndex, COL_COUNT);

    const empresaCell = dataRow.getCell(1);
    empresaCell.value = group.empresa;
    empresaCell.font = { name: "Calibri", size: 10, color: { argb: "FF0F172A" } };
    empresaCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    empresaCell.alignment = { vertical: "middle", horizontal: "left", indent: 1, wrapText: true };

    const registrosCell = dataRow.getCell(8);
    registrosCell.value = group.rows.length;
    registrosCell.font = { name: "Calibri", size: 10, color: { argb: "FF0F172A" } };
    registrosCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    registrosCell.alignment = { vertical: "middle", horizontal: "center" };

    const quantidadeCell = dataRow.getCell(10);
    quantidadeCell.value = litros;
    quantidadeCell.numFmt = "#,##0.00";
    quantidadeCell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF0F172A" } };
    quantidadeCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    quantidadeCell.alignment = { vertical: "middle", horizontal: "right" };

    applyBorder(dataRow);
    rowIndex += 1;
  });

  const totalRow = sheet.getRow(rowIndex);
  totalRow.height = 24;
  sheet.mergeCells(rowIndex, 1, rowIndex, 7);
  sheet.mergeCells(rowIndex, 8, rowIndex, 9);
  sheet.mergeCells(rowIndex, 10, rowIndex, COL_COUNT);

  const totalLabel = totalRow.getCell(1);
  totalLabel.value = `Total geral (${rows.length} ${rows.length === 1 ? "registro" : "registros"})`;
  totalLabel.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF1E3A8A" } };
  totalLabel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.totalBg } };
  totalLabel.alignment = { vertical: "middle", horizontal: "right" };

  const totalRegistros = totalRow.getCell(8);
  totalRegistros.value = rows.length;
  totalRegistros.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF1E3A8A" } };
  totalRegistros.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.totalBg } };
  totalRegistros.alignment = { vertical: "middle", horizontal: "center" };

  const totalQuantidade = totalRow.getCell(10);
  totalQuantidade.value = totalLitros;
  totalQuantidade.numFmt = "#,##0.00";
  totalQuantidade.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF1E3A8A" } };
  totalQuantidade.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.totalBg } };
  totalQuantidade.alignment = { vertical: "middle", horizontal: "right" };
  applyBorder(totalRow);
  rowIndex += 1;

  writeSeparatorRow(sheet, rowIndex);
  rowIndex += 1;

  mergeAndStyle(sheet, rowIndex, "Detalhamento por empresa do equipamento", {
    bg: COLORS.titleBg,
    fg: COLORS.titleFg,
    fontSize: 12,
    height: 26,
  });
  rowIndex += 1;

  return rowIndex;
}

function monthKeyFromDataHora(dataHora?: string): string {
  if (!dataHora) return "0000-00";
  const d = new Date(String(dataHora));
  if (Number.isNaN(d.getTime())) return "0000-00";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function sheetNameFromMonthKey(key: string): string {
  if (key === "0000-00") return "Sem data";
  const [year, month] = key.split("-");
  const idx = Number(month) - 1;
  const label = MONTH_LABELS[idx] ?? month;
  return `${label} ${year}`.slice(0, 31);
}

function groupRowsByMonth(rows: MelosaBiResumoRow[]): { key: string; rows: MelosaBiResumoRow[] }[] {
  const order: string[] = [];
  const map = new Map<string, MelosaBiResumoRow[]>();

  rows.forEach((row) => {
    const key = monthKeyFromDataHora(row.dataHora);
    if (!map.has(key)) {
      order.push(key);
      map.set(key, []);
    }
    map.get(key)!.push(row);
  });

  return order
    .sort((a, b) => a.localeCompare(b))
    .map((key) => ({ key, rows: map.get(key) ?? [] }));
}

function applyBorder(row: ExcelJS.Row, style: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFE2E8F0" } }) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = {
      top: style,
      left: style,
      bottom: style,
      right: style,
    };
  });
}

function mergeAndStyle(
  sheet: ExcelJS.Worksheet,
  rowIndex: number,
  text: string,
  opts: { bg: string; fg: string; fontSize: number; bold?: boolean; height?: number },
) {
  sheet.mergeCells(rowIndex, 1, rowIndex, COL_COUNT);
  const row = sheet.getRow(rowIndex);
  if (opts.height) row.height = opts.height;
  const cell = row.getCell(1);
  cell.value = text;
  cell.font = {
    name: "Calibri",
    size: opts.fontSize,
    bold: opts.bold ?? true,
    color: { argb: opts.fg },
  };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.bg } };
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
}

function writeColumnHeaders(sheet: ExcelJS.Worksheet, rowIndex: number) {
  const row = sheet.getRow(rowIndex);
  row.height = 28;
  COLUMNS.forEach((col, idx) => {
    const cell = row.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.headerFg } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerBg } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  applyBorder(row);
}

function estimateWrapLines(text: string, colWidth: number): number {
  const value = text.trim();
  if (!value) return 1;
  const charsPerLine = Math.max(6, Math.floor(colWidth * 1.05));
  return value.split(/\r?\n/).reduce((sum, line) => {
    return sum + Math.max(1, Math.ceil(line.length / charsPerLine));
  }, 0);
}

function computeDataRowHeight(values: Record<string, string | number>): number {
  let maxLines = 1;
  COLUMNS.forEach((col) => {
    if (col.key === "fotoQuantidade" || col.key === "quantidade") return;
    const raw = values[col.key];
    const text = raw != null ? String(raw) : "";
    maxLines = Math.max(maxLines, estimateWrapLines(text, col.width));
  });
  return Math.min(150, Math.max(22, maxLines * 15 + 4));
}

function writeHyperlinkCell(cell: ExcelJS.Cell, url: string | null | undefined, zebra: boolean) {
  const link = url?.trim();
  if (link) {
    cell.value = { text: "Abrir foto", hyperlink: link } as ExcelJS.CellHyperlinkValue;
    cell.font = { name: "Calibri", size: 10, color: { argb: COLORS.link }, underline: true };
  } else {
    cell.value = "—";
    cell.font = { name: "Calibri", size: 10, color: { argb: "FF0F172A" } };
  }
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  if (zebra) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.zebra } };
  }
}

function writeDataRow(sheet: ExcelJS.Worksheet, rowIndex: number, row: MelosaBiResumoRow, zebra: boolean) {
  const values: Record<string, string | number> = {
    dataHora: fmtDataHoraBr(row.dataHora),
    obra: fmtObra(row),
    empresa: row.empresa?.trim() || "—",
    responsavelMelosa: row.responsavelMelosa?.trim() || "—",
    ativoMelosa: row.ativoMelosa?.trim() || "—",
    responsavelEquipamento: row.responsavelEquipamento?.trim() || "—",
    ativoEquipamento: row.ativoEquipamento?.trim() || "—",
    insumo: row.insumo?.trim() || "—",
    quantidade: row.quantidadeLitros ?? "",
    local: row.local?.trim() || "—",
  };

  const excelRow = sheet.getRow(rowIndex);
  excelRow.height = computeDataRowHeight(values);

  COLUMNS.forEach((col, idx) => {
    const cell = excelRow.getCell(idx + 1);
    if (col.key === "fotoQuantidade") {
      writeHyperlinkCell(cell, row.fotoQuantidadeUrl, zebra);
      return;
    }

    cell.value = values[col.key];
    cell.font = { name: "Calibri", size: 10, color: { argb: "FF0F172A" } };
    cell.alignment = {
      vertical: "top",
      horizontal: col.key === "quantidade" ? "right" : "left",
      wrapText: true,
    };
    if (zebra) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.zebra } };
    }
  });

  const qCell = excelRow.getCell(QUANTIDADE_COL);
  if (typeof row.quantidadeLitros === "number" && Number.isFinite(row.quantidadeLitros)) {
    qCell.numFmt = "#,##0.00";
    qCell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF0F172A" } };
    qCell.alignment = { vertical: "top", horizontal: "right", wrapText: true };
  }

  applyBorder(excelRow);
}

function writeEmpresaTotalRow(sheet: ExcelJS.Worksheet, rowIndex: number, totalLitros: number, count: number) {
  const row = sheet.getRow(rowIndex);
  row.height = 22;
  const labelEndCol = Math.max(1, QUANTIDADE_COL - 1);
  if (labelEndCol > 1) {
    sheet.mergeCells(rowIndex, 1, rowIndex, labelEndCol);
  }
  const labelCell = row.getCell(1);
  labelCell.value = `Total da empresa (${count} ${count === 1 ? "registro" : "registros"})`;
  labelCell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF1E3A8A" } };
  labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.totalBg } };
  labelCell.alignment = { vertical: "middle", horizontal: "right" };

  const qCell = row.getCell(QUANTIDADE_COL);
  qCell.value = totalLitros;
  qCell.numFmt = "#,##0.00";
  qCell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF1E3A8A" } };
  qCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.totalBg } };
  qCell.alignment = { vertical: "middle", horizontal: "right" };

  for (let c = QUANTIDADE_COL + 1; c <= COL_COUNT; c += 1) {
    const cell = row.getCell(c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.totalBg } };
  }
  applyBorder(row);
}

function writeSeparatorRow(sheet: ExcelJS.Worksheet, rowIndex: number) {
  sheet.mergeCells(rowIndex, 1, rowIndex, COL_COUNT);
  const row = sheet.getRow(rowIndex);
  row.height = 10;
  const cell = row.getCell(1);
  cell.value = "";
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.separatorBg } };
  cell.border = {
    bottom: { style: "medium", color: { argb: "FF94A3B8" } },
  };
}

function initSheetColumns(sheet: ExcelJS.Worksheet) {
  COLUMNS.forEach((col, idx) => {
    sheet.getColumn(idx + 1).width = col.width;
  });
}

function buildMonthSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  rows: MelosaBiResumoRow[],
  periodoLabel: string,
) {
  const usedNames = new Set(workbook.worksheets.map((ws) => ws.name));
  let finalName = sheetName.slice(0, 31);
  let suffix = 2;
  while (usedNames.has(finalName)) {
    finalName = `${sheetName.slice(0, 28)} ${suffix}`;
    suffix += 1;
  }

  const sheet = workbook.addWorksheet(finalName);
  initSheetColumns(sheet);

  mergeAndStyle(sheet, 1, `BI abastecimentos — ${finalName}  ·  ${periodoLabel}`, {
    bg: COLORS.titleBg,
    fg: COLORS.titleFg,
    fontSize: 14,
    height: 32,
  });

  mergeAndStyle(
    sheet,
    2,
    `Gerado em ${new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date())}  ·  ${rows.length} movimentações`,
    {
      bg: "FF1E293B",
      fg: "FFCBD5E1",
      fontSize: 10,
      bold: false,
      height: 20,
    },
  );

  let rowIndex = 3;
  rowIndex = writeResumoSection(sheet, rowIndex, rows);

  const groups = sortEmpresaGroups(groupRowsByEmpresa(rows));

  groups.forEach((group, groupIdx) => {
    if (groupIdx > 0) {
      writeSeparatorRow(sheet, rowIndex);
      rowIndex += 1;
    }

    mergeAndStyle(sheet, rowIndex, group.empresa, {
      bg: COLORS.empresaBg,
      fg: COLORS.empresaFg,
      fontSize: 13,
      height: 26,
    });
    rowIndex += 1;

    writeColumnHeaders(sheet, rowIndex);
    rowIndex += 1;

    let totalLitros = 0;
    group.rows.forEach((dataRow, idx) => {
      writeDataRow(sheet, rowIndex, dataRow, idx % 2 === 1);
      if (typeof dataRow.quantidadeLitros === "number" && Number.isFinite(dataRow.quantidadeLitros)) {
        totalLitros += dataRow.quantidadeLitros;
      }
      rowIndex += 1;
    });

    writeEmpresaTotalRow(sheet, rowIndex, totalLitros, group.rows.length);
    rowIndex += 1;
  });
}

export async function downloadMelosaBiResumoExcel(
  rows: MelosaBiResumoRow[],
  options?: { periodoDe?: string; periodoAte?: string; filenamePrefix?: string },
): Promise<void> {
  if (rows.length === 0) {
    throw new Error("Não há registros para exportar.");
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Controle Abast — BI abastecimentos";
  workbook.created = new Date();

  const periodoLabel =
    options?.periodoDe && options?.periodoAte
      ? `${options.periodoDe} a ${options.periodoAte}`
      : options?.periodoDe || options?.periodoAte || "Período filtrado";

  const monthGroups = groupRowsByMonth(rows);
  monthGroups.forEach(({ key, rows: monthRows }) => {
    buildMonthSheet(workbook, sheetNameFromMonthKey(key), monthRows, periodoLabel);
  });

  const dataTag = new Date().toISOString().slice(0, 10);
  const prefix = options?.filenamePrefix ?? "bi-melosa-resumo";
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${prefix}-${dataTag}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
