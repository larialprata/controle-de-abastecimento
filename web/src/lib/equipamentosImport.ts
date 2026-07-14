import * as XLSX from "xlsx";

import { resolveMobilidadeEquipamento, type EquipamentoMobilidade } from "./equipamentoMobilidade";
import { parseEquipamentoEmpresa } from "./equipamentoEmpresa";
import { parseObraReferencia } from "./obraCodigo";

export type EquipamentoImportRow = {
  linha: number;
  ativo: string;
  nome?: string;
  obra_codigo?: number | null;
  obra_nome?: string;
  mobilidade?: EquipamentoMobilidade | null;
  empresa?: string | null;
  placa?: string | null;
};

export type EquipamentoImportParseError = {
  linha: number;
  mensagem: string;
};

const HEADER_ALIASES: Record<string, string> = {
  ativo: "ativo",
  patrimonio: "ativo",
  patrimônio: "ativo",
  codigo: "ativo",
  código: "ativo",
  id: "ativo",

  nome: "nome",
  descricao: "nome",
  descrição: "nome",
  descricao_equipamento: "nome",
  equipamento: "nome",

  obra_codigo: "obra_codigo",
  obra: "obra",
  codigo_obra: "obra_codigo",
  cod_obra: "obra_codigo",

  mobilidade: "mobilidade",
  tipo: "mobilidade",
  tipo_mobilidade: "mobilidade",
  estacionario_movel: "mobilidade",
  fixo_movel: "mobilidade",

  empresa: "empresa",
  proprietario: "empresa",
  proprietário: "empresa",

  placa: "placa",
  placa_veiculo: "placa",
  placa_caminhao: "placa",
  placa_caminhão: "placa",
};

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, "_");
}

function cellStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function isHeaderLabel(value: string): boolean {
  const n = normalizeHeader(value);
  return n === "patrimonio" || n === "equipamento" || n === "ativo" || n === "descricao";
}

export function parseMobilidade(raw: unknown): EquipamentoMobilidade | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (!s) return null;
  if (
    s === "estacionario" ||
    s === "estacionaria" ||
    s === "fixo" ||
    s === "f" ||
    s === "e" ||
    s.startsWith("estac")
  ) {
    return "ESTACIONARIO";
  }
  if (s === "movel" || s === "mov" || s === "m" || s.startsWith("mov")) {
    return "MOVEL";
  }
  return null;
}

function findHeaderRowIndex(matrix: (string | number | null)[][]): number {
  const limit = Math.min(matrix.length, 15);
  for (let i = 0; i < limit; i++) {
    const row = matrix[i] ?? [];
    const norms = row.map((c) => normalizeHeader(String(c ?? "")));
    const hasAtivo = norms.some((n) => HEADER_ALIASES[n] === "ativo" || n === "patrimonio");
    const hasNome = norms.some((n) => HEADER_ALIASES[n] === "nome" || n === "equipamento");
    if (hasAtivo && hasNome) return i;
  }
  return 0;
}

function sheetToMappedRows(sheet: XLSX.WorkSheet): Record<string, unknown>[] {
  const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  if (matrix.length < 2) return [];

  const headerIdx = findHeaderRowIndex(matrix);
  const headerRow = matrix[headerIdx] ?? [];
  const keys: string[] = headerRow.map((h) => {
    const norm = normalizeHeader(String(h ?? ""));
    return HEADER_ALIASES[norm] ?? norm;
  });

  const out: Record<string, unknown>[] = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const line = matrix[i] ?? [];
    if (line.every((c) => cellStr(c) === "")) continue;
    const obj: Record<string, unknown> = {};
    keys.forEach((k, j) => {
      if (k) obj[k] = line[j] ?? "";
    });
    const ativo = cellStr(obj.ativo);
    if (!ativo || isHeaderLabel(ativo)) continue;
    out.push(obj);
  }
  return out;
}

function mapRow(
  raw: Record<string, unknown>,
  linha: number,
): { row?: EquipamentoImportRow; error?: EquipamentoImportParseError } {
  const ativo = cellStr(raw.ativo);
  if (!ativo) {
    return { error: { linha, mensagem: "Ativo/patrimônio em branco." } };
  }
  if (isHeaderLabel(ativo)) {
    return { error: { linha, mensagem: "Linha de cabeçalho ignorada." } };
  }

  const nome = cellStr(raw.nome) || undefined;
  const obraRaw = cellStr(raw.obra_codigo) || cellStr(raw.obra);
  const obraRef = obraRaw ? parseObraReferencia(obraRaw) : {};
  const obra_codigo = obraRef.obra_codigo;
  const obra_nome = obraRef.obra_nome;

  const mobilidadeExplicit = parseMobilidade(raw.mobilidade);
  if (raw.mobilidade != null && cellStr(raw.mobilidade) && mobilidadeExplicit == null) {
    return {
      error: {
        linha,
        mensagem: `Mobilidade inválida "${cellStr(raw.mobilidade)}". Use Estacionário ou Móvel.`,
      },
    };
  }

  const empresaRaw = cellStr(raw.empresa);
  if (empresaRaw) {
    const upper = empresaRaw.toUpperCase();
    if (upper === "TERCEIRIZADO" || upper === "TERCEIRIZADA") {
      return {
        error: {
          linha,
          mensagem: `Empresa inválida "${empresaRaw}". Informe o nome da empresa (ex.: Dimensional, Construtora Alfa).`,
        },
      };
    }
  }
  const empresa = parseEquipamentoEmpresa(raw.empresa);

  const placaRaw = cellStr(raw.placa);
  const placa = placaRaw
    ? placaRaw.toUpperCase().replace(/[\s\-]/g, "") || null
    : null;

  const nomeFinal = nome || ativo;
  const mobilidade = resolveMobilidadeEquipamento(nomeFinal, mobilidadeExplicit);

  return {
    row: {
      linha,
      ativo,
      nome: nomeFinal,
      obra_codigo,
      obra_nome,
      mobilidade,
      empresa,
      placa,
    },
  };
}

export async function parseEquipamentosImportFile(
  file: File,
): Promise<{ rows: EquipamentoImportRow[]; errors: EquipamentoImportParseError[] }> {
  const buf = await file.arrayBuffer();
  const name = file.name.toLowerCase();
  const errors: EquipamentoImportParseError[] = [];

  let mapped: Record<string, unknown>[];
  if (name.endsWith(".csv")) {
    const text = new TextDecoder("utf-8").decode(buf);
    const wb = XLSX.read(text, { type: "string" });
    const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
    if (!sheet) return { rows: [], errors: [{ linha: 0, mensagem: "Arquivo CSV vazio." }] };
    mapped = sheetToMappedRows(sheet);
  } else {
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
    if (!sheet) return { rows: [], errors: [{ linha: 0, mensagem: "Planilha vazia." }] };
    mapped = sheetToMappedRows(sheet);
  }

  if (mapped.length === 0) {
    errors.push({ linha: 0, mensagem: "Nenhuma linha de dados encontrada (verifique o cabeçalho)." });
    return { rows: [], errors };
  }

  const byAtivo = new Map<string, EquipamentoImportRow>();
  mapped.forEach((raw, idx) => {
    const linha = idx + 2;
    const result = mapRow(raw, linha);
    if (result.error) {
      if (!result.error.mensagem.includes("cabeçalho")) errors.push(result.error);
      return;
    }
    if (result.row) {
      byAtivo.set(result.row.ativo.toLowerCase(), result.row);
    }
  });

  const rows = [...byAtivo.values()];
  if (rows.length === 0) {
    errors.push({ linha: 0, mensagem: "Nenhum patrimônio válido encontrado na planilha." });
  }

  return { rows, errors };
}

export function downloadEquipamentosImportTemplate(): void {
  const wb = XLSX.utils.book_new();
  const data = [
    ["ativo", "descricao", "placa", "obra_codigo", "mobilidade", "empresa"],
    ["REVTR02", "Rebocador", "KVW2O9X", "00.230", "Móvel", "Dimensional"],
    ["ASD123", "Escavadeira CAT 320", "", "00.230", "Móvel", "Dimensional"],
    ["GER-01", "Gerador obra central", "", "", "Estacionário", "Construtora Alfa"],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, sheet, "Equipamentos");
  XLSX.writeFile(wb, "modelo-importacao-equipamentos.xlsx");
}

export const IMPORT_BATCH_SIZE = 500;

export function chunkImportRows<T>(rows: T[], size = IMPORT_BATCH_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}
