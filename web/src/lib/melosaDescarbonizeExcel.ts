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
import { calcQuantidadeLitrosFromMedidores, downloadDescarbonizeExcel } from "./descarbonizeExcel";

export type MelosaExcelRowInput = {
  obraCodigo?: number;
  obraNome?: string | null;
  melosaCategoria?: string | null;
  dataHora?: string;
  insumoRetirada?: string | null;
  insumoRegistro?: string | null;
  medidorInicial?: string | null;
  medidorFinal?: string | null;
  placaTexto?: string | null;
};

function toDescarbonizeRow(row: MelosaExcelRowInput): DescarbonizeExcelRowInput {
  const insumo =
    row.insumoRetirada != null && String(row.insumoRetirada).trim()
      ? row.insumoRetirada
      : row.insumoRegistro;
  const quantidadeLitros = calcQuantidadeLitrosFromMedidores(row.medidorInicial, row.medidorFinal);
  return {
    obraCodigo: row.obraCodigo,
    obraNome: row.obraNome,
    categoriaDados: row.melosaCategoria,
    dataHora: row.dataHora,
    insumo,
    medidorInicial: row.medidorInicial,
    medidorFinal: row.medidorFinal,
    quantidadeLitros,
    placaTexto: row.placaTexto,
  };
}

export async function downloadMelosaDescarbonizeExcel(
  rows: MelosaExcelRowInput[],
  filenamePrefix = "melosa-descarbonize",
): Promise<void> {
  await downloadDescarbonizeExcel(rows.map(toDescarbonizeRow), filenamePrefix);
}
