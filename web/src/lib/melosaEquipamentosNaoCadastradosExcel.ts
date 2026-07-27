import ExcelJS from "exceljs";

export type MelosaEquipamentoNaoCadastradoInput = {
  ativoEquipamento: string;
  descricao?: string | null;
  obraCodigo?: number;
  obraNome?: string | null;
  empresa?: string | null;
  dataHora?: string;
  quantidadeLitros?: number | null;
};

export type MelosaEquipamentoNaoCadastradoRow = {
  ativo: string;
  descricao: string;
  placa: string;
  obraCodigo: number | "";
  obraNome: string;
  mobilidade: string;
  empresa: string;
  qtdAbastecimentos: number;
  totalLitros: number;
  primeiraData: string;
  ultimaData: string;
};

const IMPORT_COLUMNS = [
  { header: "ativo", key: "ativo", width: 16 },
  { header: "descricao", key: "descricao", width: 28 },
  { header: "placa", key: "placa", width: 12 },
  { header: "obra_codigo", key: "obraCodigo", width: 12 },
  { header: "mobilidade", key: "mobilidade", width: 14 },
  { header: "empresa", key: "empresa", width: 18 },
] as const;

const INFO_COLUMNS = [
  { header: "Abastecimentos", key: "qtdAbastecimentos", width: 14 },
  { header: "Total (L)", key: "totalLitros", width: 12 },
  { header: "Primeiro abastecimento", key: "primeiraData", width: 20 },
  { header: "Último abastecimento", key: "ultimaData", width: 20 },
  { header: "Obra (nome)", key: "obraNome", width: 24 },
] as const;

const COLUMNS = [...IMPORT_COLUMNS, ...INFO_COLUMNS];

function normalizeAtivoKey(value: string): string {
  return value.trim().toUpperCase().replace(/[\s\-]/g, "");
}

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

function pickDescricao(ativo: string, descricao?: string | null): string {
  const patrimonio = normalizeAtivoKey(ativo);
  const text = String(descricao ?? "").trim();
  if (!text) return "";
  if (patrimonio && normalizeAtivoKey(text) === patrimonio) return "";
  return text;
}

function pickMostFrequent(values: string[]): string {
  if (values.length === 0) return "";
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))[0]?.[0] ?? "";
}

type AggregateState = {
  ativo: string;
  descricoes: string[];
  obras: { codigo?: number; nome?: string | null }[];
  empresas: string[];
  datas: string[];
  registros: number;
  totalLitros: number;
};

export function aggregateEquipamentosNaoCadastrados(
  linhas: MelosaEquipamentoNaoCadastradoInput[],
): MelosaEquipamentoNaoCadastradoRow[] {
  const byAtivo = new Map<string, AggregateState>();

  for (const linha of linhas) {
    const ativo = linha.ativoEquipamento.trim().toUpperCase();
    if (!ativo) continue;

    const key = normalizeAtivoKey(ativo);
    let state = byAtivo.get(key);
    if (!state) {
      state = {
        ativo,
        descricoes: [],
        obras: [],
        empresas: [],
        datas: [],
        registros: 0,
        totalLitros: 0,
      };
      byAtivo.set(key, state);
    }

    state.registros += 1;
    const descricao = pickDescricao(ativo, linha.descricao);
    if (descricao) state.descricoes.push(descricao);

    state.obras.push({ codigo: linha.obraCodigo, nome: linha.obraNome });
    if (linha.empresa?.trim()) state.empresas.push(linha.empresa.trim());
    if (linha.dataHora?.trim()) state.datas.push(linha.dataHora.trim());
    if (typeof linha.quantidadeLitros === "number" && Number.isFinite(linha.quantidadeLitros)) {
      state.totalLitros += linha.quantidadeLitros;
    }
  }

  return [...byAtivo.values()]
    .map((state) => {
      const datasOrdenadas = [...state.datas].sort((a, b) => a.localeCompare(b));
      const obraMaisFrequente = pickMostFrequent(
        state.obras.map((obra) =>
          obra.codigo != null ? String(obra.codigo) : String(obra.nome ?? "").trim(),
        ),
      );
      const obraRef = state.obras.find((obra) =>
        obra.codigo != null ? String(obra.codigo) === obraMaisFrequente : String(obra.nome ?? "").trim() === obraMaisFrequente,
      );

      const obraCodigo: MelosaEquipamentoNaoCadastradoRow["obraCodigo"] =
        typeof obraRef?.codigo === "number" && Number.isFinite(obraRef.codigo) ? obraRef.codigo : "";

      return {
        ativo: state.ativo,
        descricao: pickMostFrequent(state.descricoes),
        placa: "",
        obraCodigo,
        obraNome: obraRef?.nome?.trim() || "",
        mobilidade: "",
        empresa: pickMostFrequent(state.empresas),
        qtdAbastecimentos: state.registros,
        totalLitros: state.totalLitros,
        primeiraData: fmtDataHoraBr(datasOrdenadas[0]),
        ultimaData: fmtDataHoraBr(datasOrdenadas[datasOrdenadas.length - 1]),
      };
    })
    .sort((a, b) => a.ativo.localeCompare(b.ativo, "pt-BR", { sensitivity: "base" }));
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB45309" } };
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  row.height = 24;
}

function styleInfoHeader(cell: ExcelJS.Cell) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
}

export async function downloadMelosaEquipamentosNaoCadastradosExcel(
  rows: MelosaEquipamentoNaoCadastradoRow[],
  options?: { periodoDe?: string; periodoAte?: string; filenamePrefix?: string },
): Promise<void> {
  if (rows.length === 0) {
    throw new Error("Não há equipamentos não cadastrados para exportar.");
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Controle Abast — BI abastecimentos";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Não cadastrados", {
    views: [{ state: "frozen", ySplit: 3 }],
  });

  sheet.columns = COLUMNS.map((col) => ({ header: col.header, key: col.key, width: col.width }));

  const periodoLabel =
    options?.periodoDe && options?.periodoAte
      ? `${options.periodoDe} a ${options.periodoAte}`
      : options?.periodoDe || options?.periodoAte || "Período filtrado";

  sheet.mergeCells(1, 1, 1, COLUMNS.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `Equipamentos não cadastrados — ${periodoLabel}`;
  titleCell.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92400E" } };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  sheet.mergeCells(2, 1, 2, COLUMNS.length);
  const subtitleCell = sheet.getCell(2, 1);
  subtitleCell.value =
    `Gerado em ${fmtDataHoraBr(new Date().toISOString())} · ${rows.length} patrimônio(s) · ` +
    "Preencha mobilidade e demais campos antes de importar no cadastro de ativos.";
  subtitleCell.font = { size: 10, color: { argb: "FF78350F" } };
  subtitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
  subtitleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  const headerRow = sheet.getRow(3);
  COLUMNS.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    if (idx >= IMPORT_COLUMNS.length) styleInfoHeader(cell);
  });
  styleHeaderRow(headerRow);

  rows.forEach((row, idx) => {
    const excelRow = sheet.addRow({
      ativo: row.ativo,
      descricao: row.descricao,
      placa: row.placa,
      obraCodigo: row.obraCodigo,
      mobilidade: row.mobilidade,
      empresa: row.empresa,
      qtdAbastecimentos: row.qtdAbastecimentos,
      totalLitros: row.totalLitros,
      primeiraData: row.primeiraData,
      ultimaData: row.ultimaData,
      obraNome: row.obraNome,
    });
    excelRow.height = 20;
    excelRow.eachCell((cell, colNumber) => {
      cell.font = { size: 10, color: { argb: "FF0F172A" } };
      cell.alignment = {
        vertical: "middle",
        horizontal: colNumber === COLUMNS.findIndex((c) => c.key === "totalLitros") + 1 ? "right" : "left",
        wrapText: true,
      };
      if (idx % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
      }
    });
    const totalCell = excelRow.getCell("totalLitros");
    totalCell.numFmt = "#,##0.00";
  });

  const dataTag = new Date().toISOString().slice(0, 10);
  const prefix = options?.filenamePrefix ?? "bi-melosa-nao-cadastrados";
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
