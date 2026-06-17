import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { resolveMobilidadeEquipamento } from "../lib/equipamentoMobilidade";
import { parseObraCodigoInput } from "../lib/obraCodigo";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require(path.join(__dirname, "../../../web/node_modules/xlsx")) as typeof import("xlsx");

const FILE =
  process.argv[2] ??
  "C:/Users/Dimensional-LarissaP/Desktop/modelo-importacao-equipamentos.xlsx";

type Mobilidade = "ESTACIONARIO" | "MOVEL";

type ImportRow = {
  ativo: string;
  nome: string;
  obra_codigo: number | null;
  mobilidade: Mobilidade | null;
};

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, "_");
}

function parseMobilidade(raw: unknown): Mobilidade | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (!s) return null;
  if (s.startsWith("estac") || s === "fixo" || s === "e") return "ESTACIONARIO";
  if (s.startsWith("mov") || s === "m") return "MOVEL";
  return null;
}

function findHeaderRow(matrix: (string | number | null)[][]): number {
  for (let i = 0; i < Math.min(matrix.length, 15); i++) {
    const norms = (matrix[i] ?? []).map((c) => normalizeHeader(String(c ?? "")));
    const hasAtivo = norms.some((n) =>
      ["ativo", "patrimonio", "placa", "codigo"].includes(n),
    );
    const hasNome = norms.some((n) =>
      ["descricao", "equipamento", "nome"].includes(n),
    );
    if (hasAtivo && hasNome) return i;
  }
  return 0;
}

function colIndex(header: string[], ...aliases: string[]): number {
  for (let i = 0; i < header.length; i++) {
    const n = normalizeHeader(header[i] ?? "");
    if (aliases.includes(n)) return i;
  }
  return -1;
}

function loadRows(filePath: string): ImportRow[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
  if (!sheet) throw new Error("Planilha vazia.");
  const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: "",
  });

  const headerIdx = findHeaderRow(matrix);
  const header = (matrix[headerIdx] ?? []).map((h) => String(h ?? ""));

  const iAtivo = colIndex(header, "ativo", "patrimonio", "placa", "codigo");
  const iNome = colIndex(header, "descricao", "equipamento", "nome");
  const iObra = colIndex(header, "obra_codigo", "obra", "codigo_obra");
  const iMob = colIndex(header, "mobilidade", "tipo", "tipo_mobilidade");

  if (iAtivo < 0) throw new Error("Coluna de ativo/patrimônio não encontrada.");

  const map = new Map<string, ImportRow>();
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const ativo = String(row[iAtivo] ?? "").trim();
    if (!ativo) continue;
    const nAtivo = normalizeHeader(ativo);
    if (nAtivo === "ativo" || nAtivo === "patrimonio") continue;

    const nome = (iNome >= 0 ? String(row[iNome] ?? "").trim() : "") || ativo;
    const obraRaw = iObra >= 0 ? String(row[iObra] ?? "").trim() : "";
    const obra_codigo = obraRaw ? parseObraCodigoInput(obraRaw) : null;
    const mobilidade = resolveMobilidadeEquipamento(nome, iMob >= 0 ? parseMobilidade(row[iMob]) : null);

    map.set(ativo.toLowerCase(), { ativo, nome, obra_codigo, mobilidade });
  }
  return [...map.values()];
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios no .env da API.");
  }

  const items = loadRows(FILE);
  console.log(`Arquivo: ${FILE}`);
  console.log(`Equipamentos únicos a importar: ${items.length}`);

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let criados = 0;
  let atualizados = 0;
  let erros = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const { data: existing } = await supabase
      .from("equipamentos")
      .select("ativo, tipo")
      .ilike("ativo", item.ativo)
      .maybeSingle();

    if (existing && existing.tipo !== "EQUIPAMENTO") {
      console.error(`ERRO ${item.ativo}: já existe como ${existing.tipo}`);
      erros += 1;
      continue;
    }

    const payload: Record<string, unknown> = {
      ativo: item.ativo,
      nome: item.nome,
      tipo: "EQUIPAMENTO",
      obra_codigo: item.obra_codigo,
      capacidade_litros: null,
      mobilidade: item.mobilidade,
    };

    if (existing) {
      const { error } = await supabase.from("equipamentos").update(payload).eq("ativo", existing.ativo);
      if (error) {
        console.error(`ERRO update ${item.ativo}:`, error.message);
        erros += 1;
      } else {
        atualizados += 1;
      }
    } else {
      const { error } = await supabase.from("equipamentos").insert(payload);
      if (error) {
        console.error(`ERRO insert ${item.ativo}:`, error.message);
        erros += 1;
      } else {
        criados += 1;
      }
    }

    if ((i + 1) % 20 === 0 || i + 1 === items.length) {
      process.stdout.write(`\rProgresso: ${i + 1}/${items.length}`);
    }
  }

  console.log(`\nConcluído — criados: ${criados}, atualizados: ${atualizados}, erros: ${erros}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
