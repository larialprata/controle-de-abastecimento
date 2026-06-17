import { resolveEquipamentoEmpresa, type EquipamentoEmpresa } from "./equipamentoEmpresa";
import {
  findEquipamentoExterno,
  findEquipamentoExternoByQrToken,
  normalizeAtivoPlacaExterno,
} from "./equipamentosExternos";

const ABAST_QR_TIPOS = new Set(["EQUIPAMENTO", "MELOSA", "TANQUE"]);

export type EquipamentoQrLookupResult = {
  ativo: string;
  nome: string | null;
  empresa: EquipamentoEmpresa;
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
      return {
        ativo: abast.ativo,
        nome: abast.nome,
        empresa: resolveEquipamentoEmpresa(abast.empresa),
        source: "abast",
      };
    }
    return {
      ativo: parsed.ativo.trim(),
      nome: null,
      empresa: "TERCEIRIZADO",
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
    return {
      ativo: abast.ativo,
      nome: abast.nome ?? externo.name,
      empresa: resolveEquipamentoEmpresa(abast.empresa),
      source: "abast",
    };
  }

  return {
    ativo,
    nome: externo.name,
    empresa: resolveEquipamentoEmpresa(externo.company_name),
    source: "externo",
  };
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
    return {
      ativo: abast.ativo,
      nome: abast.nome,
      empresa: resolveEquipamentoEmpresa(abast.empresa),
      source: "abast",
    };
  }

  const externo = await findEquipamentoExterno(norm, obraCodigo ?? null);
  if (!externo?.ativo_placa) return null;

  return {
    ativo: normalizeAtivoPlacaExterno(externo.ativo_placa),
    nome: externo.name,
    empresa: resolveEquipamentoEmpresa(externo.company_name),
    source: "externo",
  };
}
