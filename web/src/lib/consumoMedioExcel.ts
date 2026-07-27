import ExcelJS from "exceljs";
import type {
  ConsumoAlerta,
  ConsumoEquipamento,
  ConsumoMotorista,
  EquipamentoConsumoResposta,
} from "./consumoMedioAnalise";

function styleHeaderRow(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
}

function fmtDataExcel(v: string | null): string {
  if (!v) return "";
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

function fmtMediaExcel(v: number | null, unidade: string): string {
  if (v == null) return "";
  const label = unidade === "km" ? "L/km" : "L/h";
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${label}`;
}

export async function downloadConsumoMedioExcel(
  data: EquipamentoConsumoResposta,
  equipamentos: ConsumoEquipamento[],
  alertas: ConsumoAlerta[],
  filenamePrefix = "consumo-medio",
  motoristas?: ConsumoMotorista[],
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Controle Abast";
  workbook.created = new Date();

  const wsResumo = workbook.addWorksheet("Por equipamento", { views: [{ state: "frozen", ySplit: 1 }] });
  wsResumo.columns = [
    { header: "Equipamento", key: "ativo", width: 16 },
    { header: "Nome", key: "nome", width: 24 },
    { header: "Empresa", key: "empresa", width: 18 },
    { header: "Mobilidade", key: "mobilidade", width: 14 },
    { header: "Média", key: "media", width: 12 },
    { header: "Litros (trechos)", key: "litros", width: 14 },
    { header: "Horas/km", key: "unidade_total", width: 12 },
    { header: "Trechos", key: "trechos", width: 10 },
    { header: "Abastecimentos", key: "abast", width: 14 },
    { header: "Último abastecimento", key: "ultimo", width: 18 },
  ];
  styleHeaderRow(wsResumo.getRow(1));

  equipamentos.forEach((eq) => {
    wsResumo.addRow({
      ativo: eq.ativo,
      nome: eq.nome ?? "",
      empresa: eq.empresa ?? "",
      mobilidade: eq.mobilidade ?? "",
      media: fmtMediaExcel(eq.media_litros_por_unidade, eq.unidade),
      litros: eq.total_litros_periodo,
      unidade_total: eq.total_unidade,
      trechos: eq.trechos_count,
      abast: eq.abastecimentos_count,
      ultimo: fmtDataExcel(eq.ultimo_abastecimento),
    });
  });

  const motoristasList = motoristas ?? data.motoristas ?? [];
  if (motoristasList.length > 0) {
    const wsMot = workbook.addWorksheet("Por motorista", { views: [{ state: "frozen", ySplit: 1 }] });
    wsMot.columns = [
      { header: "Motorista", key: "motorista", width: 28 },
      { header: "Equipamentos", key: "eqs", width: 14 },
      { header: "Média", key: "media", width: 12 },
      { header: "Litros (trechos)", key: "litros", width: 14 },
      { header: "Horas/km", key: "unidade_total", width: 12 },
      { header: "Trechos", key: "trechos", width: 10 },
      { header: "Abastecimentos", key: "abast", width: 14 },
      { header: "Último abastecimento", key: "ultimo", width: 18 },
    ];
    styleHeaderRow(wsMot.getRow(1));
    motoristasList.forEach((m) => {
      wsMot.addRow({
        motorista: m.ativo,
        eqs: m.equipamentos_distintos,
        media: fmtMediaExcel(m.media_litros_por_unidade, m.unidade),
        litros: m.total_litros_periodo,
        unidade_total: m.total_unidade,
        trechos: m.trechos_count,
        abast: m.abastecimentos_count,
        ultimo: fmtDataExcel(m.ultimo_abastecimento),
      });
    });
  }

  const wsTrechos = workbook.addWorksheet("Trechos", { views: [{ state: "frozen", ySplit: 1 }] });
  wsTrechos.columns = [
    { header: "Equipamento", key: "ativo", width: 16 },
    { header: "Horímetro início", key: "hi", width: 16 },
    { header: "Horímetro fim", key: "hf", width: 16 },
    { header: "Δ", key: "delta", width: 10 },
    { header: "Litros", key: "litros", width: 10 },
    { header: "Média trecho", key: "media", width: 12 },
    { header: "Início", key: "de", width: 18 },
    { header: "Fim", key: "ate", width: 18 },
  ];
  styleHeaderRow(wsTrechos.getRow(1));

  equipamentos.forEach((eq) => {
    eq.trechos.forEach((t) => {
      wsTrechos.addRow({
        ativo: eq.ativo,
        hi: t.horimetro_inicio,
        hf: t.horimetro_fim,
        delta: t.delta_unidade,
        litros: t.litros,
        media: fmtMediaExcel(t.litros_por_unidade, eq.unidade),
        de: fmtDataExcel(t.data_hora_inicio),
        ate: fmtDataExcel(t.data_hora_fim),
      });
    });
  });

  const wsAlertas = workbook.addWorksheet("Alertas", { views: [{ state: "frozen", ySplit: 1 }] });
  wsAlertas.columns = [
    { header: "Severidade", key: "sev", width: 12 },
    { header: "Equipamento", key: "ativo", width: 16 },
    { header: "Título", key: "titulo", width: 28 },
    { header: "Descrição", key: "desc", width: 48 },
  ];
  styleHeaderRow(wsAlertas.getRow(1));
  alertas.forEach((a) => {
    wsAlertas.addRow({
      sev: a.severidade,
      ativo: a.ativo ?? "",
      titulo: a.titulo,
      desc: a.descricao,
    });
  });

  const wsQualidade = workbook.addWorksheet("Qualidade", { views: [{ state: "frozen", ySplit: 1 }] });
  wsQualidade.columns = [
    { header: "Data/hora", key: "data", width: 18 },
    { header: "Equipamento", key: "ativo", width: 16 },
    { header: "Nome", key: "nome", width: 24 },
    { header: "Horímetro informado", key: "hor", width: 20 },
    { header: "Litros", key: "litros", width: 10 },
  ];
  styleHeaderRow(wsQualidade.getRow(1));
  data.sem_horimetro_rows.forEach((r) => {
    wsQualidade.addRow({
      data: fmtDataExcel(r.data_hora),
      ativo: r.ativo,
      nome: r.nome ?? "",
      hor: r.horimetro_informado ?? "",
      litros: r.litros,
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const hoje = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${filenamePrefix}-${hoje}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
