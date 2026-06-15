import ExcelJS from "exceljs";

export type DashboardCicloExcelRow = {
  ciclo_numero: number;
  ativo_melosa_texto: string;
  ciclo_anterior_numero: number | null;
  data_hora: string;
  litros_retirada: number;
  litros_sobra_anterior: number;
  litros_abastecidos: number;
  litros_devolvidos: number;
  litros_sobra_atual: number;
  capacidade_litros: number | null;
  volume_excedente: number;
  status: string;
};

export type DashboardDesvioExcelRow = {
  data_hora: string;
  ativo_melosa_texto: string;
  ativo_equipamento_texto: string | null;
  litros: number;
  medidor_inicial: string | null;
  medidor_final: string | null;
  medidor_esperado: number | null;
  desvio_litros: number | null;
};

function fmtDataExcel(v: string): string {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
}

function autoWidth(sheet: ExcelJS.Worksheet, min = 10, max = 42) {
  sheet.columns.forEach((col) => {
    let w = min;
    if (col.eachCell) {
      col.eachCell({ includeEmpty: true }, (cell) => {
        const len = String(cell.value ?? "").length;
        if (len + 2 > w) w = len + 2;
      });
    }
    col.width = Math.min(max, w);
  });
}

export async function downloadDashboardCiclosExcel(
  ciclos: DashboardCicloExcelRow[],
  desvios: DashboardDesvioExcelRow[],
  filenamePrefix = "dashboard-melosas",
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Controle Abast";
  workbook.created = new Date();

  const wsCiclos = workbook.addWorksheet("Ciclos", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  wsCiclos.columns = [
    { header: "ID", key: "id", width: 8 },
    { header: "Melosa", key: "melosa", width: 14 },
    { header: "ID anterior (mesma melosa)", key: "id_anterior", width: 22 },
    { header: "Data/hora", key: "data_hora", width: 18 },
    { header: "Enchimento (L)", key: "enchimento", width: 14 },
    { header: "Sobra anterior (L)", key: "sobra_anterior", width: 16 },
    { header: "Abastecido (L)", key: "abastecido", width: 14 },
    { header: "Devolvido (L)", key: "devolvido", width: 14 },
    { header: "Sobra atual (L)", key: "sobra_atual", width: 14 },
    { header: "Capacidade (L)", key: "capacidade", width: 14 },
    { header: "Excedente (L)", key: "excedente", width: 14 },
    { header: "Status", key: "status", width: 12 },
  ];

  styleHeaderRow(wsCiclos.getRow(1));

  for (const c of ciclos) {
    const row = wsCiclos.addRow({
      id: c.ciclo_numero,
      melosa: c.ativo_melosa_texto,
      id_anterior: c.ciclo_anterior_numero ?? "",
      data_hora: fmtDataExcel(c.data_hora),
      enchimento: c.litros_retirada,
      sobra_anterior: c.litros_sobra_anterior,
      abastecido: c.litros_abastecidos,
      devolvido: c.litros_devolvidos,
      sobra_atual: c.litros_sobra_atual,
      capacidade: c.capacidade_litros ?? "",
      excedente: c.volume_excedente > 0 ? c.volume_excedente : "",
      status: c.status === "suspeito" ? "Suspeito" : "OK",
    });
    if (c.status === "suspeito") {
      row.getCell("status").font = { bold: true, color: { argb: "FFB91C1C" } };
    }
  }

  wsCiclos.getColumn("enchimento").numFmt = "#,##0.00";
  wsCiclos.getColumn("sobra_anterior").numFmt = "#,##0.00";
  wsCiclos.getColumn("abastecido").numFmt = "#,##0.00";
  wsCiclos.getColumn("devolvido").numFmt = "#,##0.00";
  wsCiclos.getColumn("sobra_atual").numFmt = "#,##0.00";
  wsCiclos.getColumn("capacidade").numFmt = "#,##0.00";
  wsCiclos.getColumn("excedente").numFmt = "#,##0.00";
  autoWidth(wsCiclos);

  if (desvios.length > 0) {
    const wsDesvios = workbook.addWorksheet("Alertas medidor", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    wsDesvios.columns = [
      { header: "Data/hora", key: "data_hora", width: 18 },
      { header: "Melosa", key: "melosa", width: 14 },
      { header: "Equipamento", key: "equipamento", width: 14 },
      { header: "Litros", key: "litros", width: 10 },
      { header: "Medidor inicial", key: "medidor_inicial", width: 16 },
      { header: "Medidor final", key: "medidor_final", width: 16 },
      { header: "Esperado (anterior)", key: "esperado", width: 18 },
      { header: "Desvio (L)", key: "desvio", width: 12 },
    ];
    styleHeaderRow(wsDesvios.getRow(1));
    for (const d of desvios) {
      wsDesvios.addRow({
        data_hora: fmtDataExcel(d.data_hora),
        melosa: d.ativo_melosa_texto,
        equipamento: d.ativo_equipamento_texto ?? "",
        litros: d.litros,
        medidor_inicial: d.medidor_inicial ?? "",
        medidor_final: d.medidor_final ?? "",
        esperado: d.medidor_esperado ?? "",
        desvio: d.desvio_litros ?? "",
      });
    }
    wsDesvios.getColumn("litros").numFmt = "#,##0.00";
    wsDesvios.getColumn("desvio").numFmt = "#,##0.00";
    autoWidth(wsDesvios);
  }

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
