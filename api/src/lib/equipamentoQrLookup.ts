import { normalizeEquipamentoEmpresa } from "./equipamentoEmpresa";
import {
  findEquipamentoExterno,
  findEquipamentoExternoByQrToken,
  normalizeAtivoPlacaExterno,
} from "./equipamentosExternos";

const ABAST_QR_TIPOS = new Set(["EQUIPAMENTO", "MELOSA", "TANQUE"]);

export type EquipamentoQrLookupResult = {
  ativo: string;
  nome: string | null;
  empresa: string | null;
  source: "abast" | "externo";
};

function normalizeQrScanText(raw: string): string {
  let text = raw.trim().replace(/^\uFEFF/, "");
  if (!text) return "";

  if (/%[0-9A-Fa-f]{2}/.test(text)) {
    try {
      const decoded = decodeURIComponent(text).trim().replace(/^\uFEFF/, "");
      if (decoded) text = decoded;
    } catch {
      // mantém o texto original
    }
  }

  return text;
}

function parseAbastQrContent(text: string): { kind: "abast"; ativo: string } | null {
  const match = text.match(/^CONTROLE_ABAST:(.+)$/i);
  if (!match?.[1]) return null;

  const body = match[1].trim();
  if (!body) return null;

  const segments = body.split(":");
  const maybeTipo = segments[0]?.trim().toUpperCase() ?? "";

  if (ABAST_QR_TIPOS.has(maybeTipo) && segments.length >= 2) {
    const ativo = segments.slice(1).join(":").trim();
    if (ativo) return { kind: "abast", ativo };
  }

  if (segments.length === 1) {
    return { kind: "abast", ativo: body };
  }

  return null;
}

export function parseEquipamentoQrContent(
  raw: string,
): { kind: "abast"; ativo: string } | { kind: "token"; token: string } | null {
  const text = normalizeQrScanText(raw);
  if (!text) return null;

  const abast = parseAbastQrContent(text);
  if (abast) return abast;

  const queryMatch = text.match(/[?&]qr=([^&#]+)/i);
  if (queryMatch?.[1]) {
    const token = decodeURIComponent(queryMatch[1]).trim();
    if (token) return { kind: "token", token };
  }

  const shortPathMatch = text.match(/(?:^|\/)q\/([^/?#]+)/i);
  if (shortPathMatch?.[1]) {
    const token = decodeURIComponent(shortPathMatch[1]).trim();
    if (token) return { kind: "token", token };
  }

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) {
    return { kind: "token", token: text };
  }

  return null;
}

type AbastEquipamentoRow = {
  ativo: string;
  nome: string | null;
  empresa: string | null;
};

async function resolveDadosExternos(
  ativo: string,
  obraCodigo?: number | null,
): Promise<{ nome: string | null; empresa: string | null }> {
  let row = await findEquipamentoExterno(ativo, obraCodigo ?? null);
  if (!row?.ativo_placa && obraCodigo != null) {
    row = await findEquipamentoExterno(ativo, null);
  }
  if (!row) return { nome: null, empresa: null };
  return {
    nome: row.name?.trim() || null,
    empresa: normalizeEquipamentoEmpresa(row.company_name),
  };
}

function pickEquipamentoDescricao(
  ativo: string,
  abastNome: string | null | undefined,
  externoNome: string | null | undefined,
): string | null {
  const abast = abastNome?.trim() || null;
  const externo = externoNome?.trim() || null;
  const ativoNorm = normalizeAtivoPlacaExterno(ativo);

  const abastEhDescricao = Boolean(abast && normalizeAtivoPlacaExterno(abast) !== ativoNorm);
  const externoEhDescricao = Boolean(externo && normalizeAtivoPlacaExterno(externo) !== ativoNorm);

  if (abastEhDescricao) return abast;
  if (externoEhDescricao) return externo;
  if (abast) return abast;
  if (externo) return externo;
  return null;
}

function buildLookupResult(input: {
  ativo: string;
  abastNome: string | null | undefined;
  abastEmpresa: string | null | undefined;
  externoNome: string | null | undefined;
  externoEmpresa: string | null | undefined;
  source: "abast" | "externo";
}): EquipamentoQrLookupResult {
  return {
    ativo: input.ativo,
    nome: pickEquipamentoDescricao(input.ativo, input.abastNome, input.externoNome),
    empresa:
      normalizeEquipamentoEmpresa(input.abastEmpresa) ??
      normalizeEquipamentoEmpresa(input.externoEmpresa),
    source: input.source,
  };
}

export async function lookupEquipamentoFromQr(
  qr: string,
  obraCodigo: number | null | undefined,
  loadAbastEquipamento: (ativo: string, obraCodigo?: number | null) => Promise<AbastEquipamentoRow | null>,
): Promise<EquipamentoQrLookupResult | null> {
  const normalizedQr = normalizeQrScanText(qr);
  const parsed = parseEquipamentoQrContent(normalizedQr);

  if (parsed?.kind === "abast") {
    const abast = await loadAbastEquipamento(parsed.ativo, obraCodigo);
    if (abast) {
      const externos = await resolveDadosExternos(parsed.ativo, obraCodigo);
      return buildLookupResult({
        ativo: abast.ativo,
        abastNome: abast.nome,
        abastEmpresa: abast.empresa,
        externoNome: externos.nome,
        externoEmpresa: externos.empresa,
        source: "abast",
      });
    }

    const fallback = await lookupEquipamentoByAtivo(parsed.ativo, obraCodigo, loadAbastEquipamento);
    if (fallback) return fallback;

    return {
      ativo: parsed.ativo.trim(),
      nome: null,
      empresa: null,
      source: "abast",
    };
  }

  if (!parsed) {
    return lookupEquipamentoByAtivo(normalizedQr, obraCodigo, loadAbastEquipamento);
  }

  const externo = await findEquipamentoExternoByQrToken(parsed.token);
  if (!externo?.ativo_placa) return null;

  const ativo = normalizeAtivoPlacaExterno(externo.ativo_placa);
  const obra = obraCodigo ?? (externo.obra_code ? Number(String(externo.obra_code).replace(/\D/g, "")) || null : null);
  const abast = await loadAbastEquipamento(ativo, obra);

  if (abast) {
    return buildLookupResult({
      ativo: abast.ativo,
      abastNome: abast.nome,
      abastEmpresa: abast.empresa,
      externoNome: externo.name,
      externoEmpresa: externo.company_name,
      source: "abast",
    });
  }

  return buildLookupResult({
    ativo,
    abastNome: null,
    abastEmpresa: null,
    externoNome: externo.name,
    externoEmpresa: externo.company_name,
    source: "externo",
  });
}

export async function lookupEquipamentoByAtivo(
  ativo: string,
  obraCodigo: number | null | undefined,
  loadAbastEquipamento: (ativo: string, obraCodigo?: number | null) => Promise<AbastEquipamentoRow | null>,
): Promise<EquipamentoQrLookupResult | null> {
  const norm = normalizeAtivoPlacaExterno(ativo);
  if (!norm) return null;

  const abast = await loadAbastEquipamento(norm, obraCodigo);
  if (abast) {
    const externos = await resolveDadosExternos(norm, obraCodigo);
    return buildLookupResult({
      ativo: abast.ativo,
      abastNome: abast.nome,
      abastEmpresa: abast.empresa,
      externoNome: externos.nome,
      externoEmpresa: externos.empresa,
      source: "abast",
    });
  }

  const externo = await findEquipamentoExterno(norm, obraCodigo ?? null);
  if (!externo?.ativo_placa) {
    const externoSemObra = obraCodigo != null ? await findEquipamentoExterno(norm, null) : null;
    if (!externoSemObra?.ativo_placa) return null;
    return buildLookupResult({
      ativo: normalizeAtivoPlacaExterno(externoSemObra.ativo_placa),
      abastNome: null,
      abastEmpresa: null,
      externoNome: externoSemObra.name,
      externoEmpresa: externoSemObra.company_name,
      source: "externo",
    });
  }

  return buildLookupResult({
    ativo: normalizeAtivoPlacaExterno(externo.ativo_placa),
    abastNome: null,
    abastEmpresa: null,
    externoNome: externo.name,
    externoEmpresa: externo.company_name,
    source: "externo",
  });
}
