export {
  DESCARBONIZE_TEMPLATE_URL as MELOSA_DESCARBONIZE_TEMPLATE_URL,
  DESCARBONIZE_SUBCATEGORIA_DADOS as MELOSA_SUBCATEGORIA_DADOS,
  DESCARBONIZE_CATEGORIA_MOVEL as MELOSA_CATEGORIA_MOVEL,
  DESCARBONIZE_CATEGORIA_ESTACIONARIA as MELOSA_CATEGORIA_ESTACIONARIA,
  DESCARBONIZE_EVIDENCIA as MELOSA_EVIDENCIA,
  DESCARBONIZE_RECEITA_DIFERENTE as MELOSA_RECEITA_DIFERENTE,
  calcQuantidadeLitrosFromMedidores,
  fmtDataExcel,
  fmtUnidadeNegocio,
  fmtCategoriaDados,
  buildDescarbonizeWorkbook as buildMelosaDescarbonizeWorkbook,
} from "./descarbonizeExcel";

import type { DescarbonizeExcelRowInput } from "./descarbonizeExcel";
import { downloadDescarbonizeExcelByMonth } from "./descarbonizeExcel";

export type MelosaExcelRowInput = {
  obraCodigo?: number;
  obraNome?: string | null;
  melosaCategoria?: string | null;
  /** Mobilidade do equipamento abastecido (cadastro): ESTACIONARIO | MOVEL */
  equipamentoMobilidade?: string | null;
  dataHora?: string;
  insumoRetirada?: string | null;
  insumoRegistro?: string | null;
  quantidadeAbastecida?: string | null;
  placaTexto?: string | null;
  ativoEquipamento?: string | null;
};

function resolveCategoriaDados(row: MelosaExcelRowInput): string {
  const mobilidade = String(row.equipamentoMobilidade ?? "").trim().toUpperCase();
  if (mobilidade === "ESTACIONARIO") return "ESTACIONARIA";
  if (mobilidade === "MOVEL") return "MOVEL";

  const categoria = String(row.melosaCategoria ?? "").trim().toUpperCase();
  if (categoria === "ESTACIONARIA") return "ESTACIONARIA";
  if (categoria === "MOVEL") return "MOVEL";

  return "MOVEL";
}

function toDescarbonizeRow(row: MelosaExcelRowInput): DescarbonizeExcelRowInput {
  const insumo =
    row.insumoRetirada != null && String(row.insumoRetirada).trim()
      ? row.insumoRetirada
      : row.insumoRegistro;
  const quantidadeLitros = parseLitrosFromText(row.quantidadeAbastecida);
  return {
    obraCodigo: row.obraCodigo,
    obraNome: row.obraNome,
    categoriaDados: resolveCategoriaDados(row),
    dataHora: row.dataHora,
    insumo,
    medidorInicial: row.quantidadeAbastecida,
    medidorFinal: null,
    quantidadeLitros,
    placaTexto: row.placaTexto,
    ativoEquipamento: row.ativoEquipamento,
  };
}

function parseLitrosFromText(value: string | null | undefined): number | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function downloadMelosaDescarbonizeExcel(
  rows: MelosaExcelRowInput[],
  filenamePrefix = "melosa-descarbonize",
): Promise<void> {
  await downloadDescarbonizeExcelByMonth(rows.map(toDescarbonizeRow), filenamePrefix);
}
