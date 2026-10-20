import ExcelJS from "exceljs";

export type HorimetroExcelRow = {
  dataHora?: string | null;
  obra?: string | null;
  empresa?: string | null;
  ativoMelosa?: string | null;
  ativoEquipamento?: string | null;
  patrimonio?: string | null;
  insumo?: string | null;
  quantidadeLitros?: number | null;
  horimetro?: string | null;
  fotoHorimetroUrl?: string | null;
  lacreTanque?: string | null;
  lacreMelosa?: string | null;
  fotoLacreTanqueUrl?: string | null;
  fotoLacreMelosaUrl?: string | null;
  motorista?: string | null;
  tanque?: string | null;
  usuario?: string | null;
};

type ColumnKey =
  | Exclude<
      keyof HorimetroExcelRow,
      "quantidadeLitros" | "fotoHorimetroUrl" | "fotoLacreTanqueUrl" | "fotoLacreMelosaUrl"
    >
  | "quantidade"
  | "foto"
  | "fotoLacreTanque"
  | "fotoLacreMelosa";

const COLUMNS_ABASTECIMENTO: { header: string; key: ColumnKey; width: number }[] = [
  { header: "Data/Horário", key: "dataHora", width: 18 },
  { header: "Obra", key: "obra", width: 28 },
  { header: "Empresa", key: "empresa", width: 16 },
  { header: "Ativo melosa", key: "ativoMelosa", width: 16 },
  { header: "Ativo equipamento", key: "ativoEquipamento", width: 24 },
  { header: "Insumo", key: "insumo", width: 16 },
  { header: "Quantidade (L)", key: "quantidade", width: 16 },
  { header: "Horímetro", key: "horimetro", width: 16 },
  { header: "Foto horímetro", key: "foto", width: 18 },
  { header: "Motorista", key: "motorista", width: 22 },
];

const COLUMNS_TANQUE: { header: string; key: ColumnKey; width: number }[] = [
  { header: "Data/Horário", key: "dataHora", width: 18 },
  { header: "Obra", key: "obra", width: 28 },
  { header: "Patrimônio", key: "patrimonio", width: 18 },
  { header: "Insumo", key: "insumo", width: 16 },
  { header: "Quantidade (L)", key: "quantidade", width: 16 },
  { header: "Horímetro", key: "horimetro", width: 16 },
  { header: "Foto horímetro", key: "foto", width: 18 },
  { header: "Nº lacre tanque", key: "lacreTanque", width: 16 },
  { header: "Foto lacre tanque", key: "fotoLacreTanque", width: 18 },
  { header: "Nº lacre melosa", key: "lacreMelosa", width: 16 },
  { header: "Foto lacre melosa", key: "fotoLacreMelosa", width: 18 },
  { header: "Tanque", key: "tanque", width: 12 },
  { header: "Usuário", key: "usuario", width: 22 },
];

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

function textOrDash(value: string | null | undefined): string {
  const raw = value != null ? String(value).trim() : "";
  if (!raw || raw === "—") return "—";
  return raw;
}

function cellText(row: HorimetroExcelRow, key: ColumnKey): string | number {
  if (key === "quantidade") {
    return typeof row.quantidadeLitros === "number" && Number.isFinite(row.quantidadeLitros)
      ? row.quantidadeLitros
      : "—";
  }
  if (key === "dataHora") return fmtDataHoraBr(row.dataHora) || "—";
  if (key === "foto" || key === "fotoLacreTanque" || key === "fotoLacreMelosa") return "";
  return textOrDash(row[key]);
}

function fotoUrl(row: HorimetroExcelRow, key: ColumnKey): string | null {
  if (key === "foto") return row.fotoHorimetroUrl?.trim() || null;
  if (key === "fotoLacreTanque") return row.fotoLacreTanqueUrl?.trim() || null;
  if (key === "fotoLacreMelosa") return row.fotoLacreMelosaUrl?.trim() || null;
  return null;
}

async function writeHorimetroWorkbook(
  rows: HorimetroExcelRow[],
  title: string,
  columns: { header: string; key: ColumnKey; width: number }[],
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Controle Abast";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Horímetro", {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  sheet.mergeCells(1, 1, 1, columns.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { name: "Calibri", bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  sheet.getRow(1).height = 28;

  const headerRow = sheet.getRow(2);
  headerRow.height = 22;
  columns.forEach((col, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = col.header;
    cell.font = { name: "Calibri", bold: true, size: 11, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
    sheet.getColumn(index + 1).width = col.width;
  });

  const quantidadeCol = columns.findIndex((col) => col.key === "quantidade") + 1;

  rows.forEach((row, rowIdx) => {
    const excelRow = sheet.getRow(rowIdx + 3);
    excelRow.height = 20;
    const zebra = rowIdx % 2 === 1;
    columns.forEach((col, colIdx) => {
      const cell = excelRow.getCell(colIdx + 1);
      if (col.key === "foto" || col.key === "fotoLacreTanque" || col.key === "fotoLacreMelosa") {
        const link = fotoUrl(row, col.key);
        if (link) {
          cell.value = { text: "Abrir foto", hyperlink: link };
          cell.font = { name: "Calibri", size: 10, color: { argb: "FF1D4ED8" }, underline: true };
        } else {
          cell.value = "—";
          cell.font = { name: "Calibri", size: 10, color: { argb: "FF0F172A" } };
        }
        cell.alignment = { vertical: "middle", horizontal: "center" };
      } else {
        cell.value = cellText(row, col.key);
        cell.font = { name: "Calibri", size: 10, color: { argb: "FF0F172A" } };
        cell.alignment = {
          vertical: "middle",
          horizontal: col.key === "quantidade" ? "right" : "left",
          wrapText: true,
        };
        if (col.key === "quantidade" && typeof cell.value === "number") {
          cell.numFmt = "#,##0.###";
        }
      }
      if (zebra) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      }
    });
  });

  if (quantidadeCol > 0) {
    sheet.autoFilter = {
      from: { row: 2, column: 1 },
      to: { row: Math.max(2, rows.length + 2), column: columns.length },
    };
  }

  return workbook;
}

async function downloadWorkbook(workbook: ExcelJS.Workbook, filenamePrefix: string): Promise<void> {
  const dataTag = new Date().toISOString().slice(0, 10);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenamePrefix}-${dataTag}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadAbastecimentoHorimetroExcel(rows: HorimetroExcelRow[]): Promise<void> {
  if (rows.length === 0) {
    throw new Error("Não há abastecimentos para exportar.");
  }
  const workbook = await writeHorimetroWorkbook(
    rows,
    "BI Abastecimentos — Horímetro",
    COLUMNS_ABASTECIMENTO,
  );
  await downloadWorkbook(workbook, "bi-abastecimento-horimetro");
}

export async function downloadTanqueHorimetroExcel(rows: HorimetroExcelRow[]): Promise<void> {
  if (rows.length === 0) {
    throw new Error("Não há retiradas de tanque para exportar.");
  }
  const workbook = await writeHorimetroWorkbook(rows, "BI Tanque — Horímetro", COLUMNS_TANQUE);
  await downloadWorkbook(workbook, "bi-tanque-horimetro");
}
