import type { DescarbonizeExcelRowInput } from "./descarbonizeExcel";
import {
  calcQuantidadeLitrosRetiradaTanqueFromMedidores,
  downloadDescarbonizeExcel,
} from "./descarbonizeExcel";

export { calcQuantidadeLitrosRetiradaTanqueFromMedidores };

export type TanqueExcelRowInput = {
  obraCodigo?: number;
  obraNome?: string | null;
  dataHora?: string;
  combustivelTipo?: string | null;
  medidorTanqueInicial?: string | null;
  medidorTanqueFinal?: string | null;
  litros?: number | null;
  placaTexto?: string | null;
};

function toDescarbonizeRow(row: TanqueExcelRowInput): DescarbonizeExcelRowInput {
  return {
    obraCodigo: row.obraCodigo,
    obraNome: row.obraNome,
    categoriaDados: "ESTACIONARIA",
    dataHora: row.dataHora,
    insumo: row.combustivelTipo,
    medidorInicial: row.medidorTanqueInicial,
    medidorFinal: row.medidorTanqueFinal,
    quantidadeLitros: row.litros,
    placaTexto: row.placaTexto,
  };
}

export async function downloadTanqueDescarbonizeExcel(
  rows: TanqueExcelRowInput[],
  filenamePrefix = "bi-tanque-descarbonize",
): Promise<void> {
  await downloadDescarbonizeExcel(rows.map(toDescarbonizeRow), filenamePrefix);
}
