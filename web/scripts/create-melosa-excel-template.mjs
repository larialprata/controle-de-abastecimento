import ExcelJS from "exceljs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "templates");
const outFile = join(outDir, "planilha-melosa-descarbonize.xlsx");

const headers = [
  "Unidade de negócio",
  "Categoria de dados",
  "Subcategoria de dados",
  "Data de início",
  "Data de fim",
  "Fator de emissão",
  "Quantidade",
  "Detalhe um",
  "Detalhe dois",
  "Comentários",
  "Evidência",
  "Percentual de receita diferente?",
  "Receita % - Descarbonize",
];

const widths = [28, 52, 42, 14, 14, 18, 14, 14, 18, 16, 22, 28, 22];

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet("Bulk Import Template");

const headerRow = sheet.addRow(headers);
headerRow.font = { bold: true, name: "Arial", size: 11 };
headerRow.alignment = { vertical: "middle", wrapText: true };
headerRow.height = 28;

widths.forEach((w, i) => {
  sheet.getColumn(i + 1).width = w;
});

headerRow.eachCell((cell) => {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } };
  cell.border = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
});

await mkdir(outDir, { recursive: true });
const buffer = await workbook.xlsx.writeBuffer();
await writeFile(outFile, buffer);
console.log("Template criado:", outFile);
