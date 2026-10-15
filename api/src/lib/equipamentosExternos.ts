import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import pg from "pg";

export type EquipamentoExternoRow = {
  id: string;
  ativo_placa: string;
  qr_token: string;
  name: string;
  obra_code: string | null;
  company_name: string | null;
  contract_name: string | null;
};

type EquipmentDbRow = {
  id: string;
  ativo_placa: string | null;
  qr_token: string;
  name: string;
  company_name: string | null;
  obras: { code: string } | { code: string }[] | null;
  contracts: { name: string } | { name: string }[] | null;
};

const EQUIPMENT_SELECT = `
  id,
  ativo_placa,
  qr_token,
  name,
  company_name,
  obras ( code ),
  contracts ( name )
`;

export function normalizeAtivoPlacaExterno(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function expandAtivoSearchNeedles(ativo: string): string[] {
  const trimmed = ativo.trim();
  const norm = normalizeAtivoPlacaExterno(ativo);
  if (!norm) return [];

  const needles = new Set<string>();
  if (trimmed) needles.add(trimmed);
  const upper = trimmed.toUpperCase();
  if (upper) needles.add(upper);
  needles.add(norm);

  const lettersThenRest = norm.match(/^([A-Z]+)(.+)$/);
  if (lettersThenRest) {
    needles.add(`${lettersThenRest[1]} ${lettersThenRest[2]}`);
  }

  return [...needles];
}

export function ativosPatrimonioEquivalentes(a: string, b: string): boolean {
  return normalizeAtivoPlacaExterno(a) === normalizeAtivoPlacaExterno(b);
}

/** Patrimônio gravado como `ATIVO_00.238` é o ativo ATIVO na obra 238. */
export function separarSufixoObraAtivo(ativo: string): { ativo: string; obra: number | null } {
  const trimmed = ativo.trim().toUpperCase();
  const match = trimmed.match(/^(.*?)_0*\.(\d+)$/);
  if (match?.[1]) {
    const obra = Number(match[2]);
    return {
      ativo: match[1].trim(),
      obra: Number.isFinite(obra) && obra > 0 ? obra : null,
    };
  }
  return { ativo: trimmed, obra: null };
}

export function normalizeObraCodeExterno(value: number | string | null | undefined): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const semPrefixo = raw.replace(/^0+\.?/, "");
  const digits = semPrefixo.replace(/\D/g, "");
  return digits || semPrefixo;
}

export function buildEquipamentoExternoQrUrl(
  qrToken: string,
  publicBaseUrl: string | undefined,
): string {
  const base = (publicBaseUrl ?? "").replace(/\/+$/, "");
  if (!base) return qrToken;
  return `${base}/q/${encodeURIComponent(qrToken)}`;
}

function pickNested<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapEquipmentRow(row: EquipmentDbRow): EquipamentoExternoRow | null {
  const ativo = row.ativo_placa?.trim();
  if (!ativo) return null;
  const obra = pickNested(row.obras);
  const contract = pickNested(row.contracts);
  return {
    id: row.id,
    ativo_placa: ativo,
    qr_token: row.qr_token,
    name: row.name,
    company_name: row.company_name,
    obra_code: obra?.code ?? null,
    contract_name: contract?.name ?? null,
  };
}

function pickBestMatch(
  rows: EquipamentoExternoRow[],
  ativoNorm: string,
  obraNorm: string | null,
): EquipamentoExternoRow | null {
  const matching = rows.filter((row) => normalizeAtivoPlacaExterno(row.ativo_placa) === ativoNorm);
  if (matching.length === 0) return null;

  if (obraNorm) {
    const withObra = matching.filter((row) => {
      const rowObraNorm = normalizeObraCodeExterno(row.obra_code);
      return rowObraNorm === obraNorm || row.obra_code === obraNorm;
    });
    if (withObra.length > 0) return withObra[0];
  }

  return matching[0] ?? null;
}

function deriveEquipamentosSupabaseUrl(): string | null {
  const explicit = process.env.EQUIPAMENTOS_SUPABASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const dbUrl = process.env.EQUIPAMENTOS_DB_URL?.trim();
  const ref = dbUrl?.match(/postgres\.([a-z0-9]+)/i)?.[1];
  return ref ? `https://${ref}.supabase.co` : null;
}

let equipamentosSupabase: SupabaseClient | null = null;

function getEquipamentosSupabase(): SupabaseClient | null {
  const url = deriveEquipamentosSupabaseUrl();
  const key = process.env.EQUIPAMENTOS_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;

  if (!equipamentosSupabase) {
    equipamentosSupabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return equipamentosSupabase;
}

let pool: pg.Pool | null = null;

function getPgPool(): pg.Pool | null {
  const url = process.env.EQUIPAMENTOS_DB_URL?.trim();
  if (!url) return null;
  if (!pool) {
    pool = new pg.Pool({
      connectionString: url,
      ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
      max: 3,
    });
  }
  return pool;
}

export function isEquipamentosExternosConfigured(): boolean {
  return Boolean(getEquipamentosSupabase()) || Boolean(getPgPool());
}

export function equipamentosExternosConnectionMode(): "supabase" | "postgres" | null {
  if (getEquipamentosSupabase()) return "supabase";
  if (getPgPool()) return "postgres";
  return null;
}

async function findEquipamentoExternoViaSupabase(
  ativo: string,
  obraCodigo?: number | null,
): Promise<EquipamentoExternoRow | null> {
  const supabase = getEquipamentosSupabase();
  if (!supabase) return null;

  const ativoNorm = normalizeAtivoPlacaExterno(ativo);
  if (!ativoNorm) return null;
  const obraNorm = normalizeObraCodeExterno(obraCodigo);
  const needles = expandAtivoSearchNeedles(ativo);

  for (const needle of needles) {
    const { data, error } = await supabase
      .from("equipments")
      .select(EQUIPMENT_SELECT)
      .eq("active", true)
      .not("ativo_placa", "is", null)
      .ilike("ativo_placa", needle)
      .limit(12);

    if (error) throw new Error(error.message);

    const mapped = (data ?? [])
      .map((row) => mapEquipmentRow(row as EquipmentDbRow))
      .filter((row): row is EquipamentoExternoRow => row != null);

    const pick = pickBestMatch(mapped, ativoNorm, obraNorm);
    if (pick) return pick;
  }

  return null;
}

async function findEquipamentoExternoViaPg(
  ativo: string,
  obraCodigo?: number | null,
): Promise<EquipamentoExternoRow | null> {
  const db = getPgPool();
  if (!db) return null;

  const ativoNorm = normalizeAtivoPlacaExterno(ativo);
  if (!ativoNorm) return null;
  const obraNorm = normalizeObraCodeExterno(obraCodigo);

  const { rows } = await db.query<EquipamentoExternoRow>(
    `
      SELECT
        e.id,
        e.ativo_placa,
        e.qr_token,
        e.name,
        e.company_name,
        o.code AS obra_code,
        c.name AS contract_name
      FROM equipments e
      LEFT JOIN obras o ON o.id = e.obra_id
      LEFT JOIN contracts c ON c.id = e.contract_id
      WHERE e.active = true
        AND e.ativo_placa IS NOT NULL
        AND upper(replace(e.ativo_placa, ' ', '')) = $1
        AND (
          $2::text IS NULL
          OR o.code IS NULL
          OR regexp_replace(o.code, '^0+\\.?', '') = $2
          OR o.code = $2
        )
      ORDER BY
        CASE WHEN o.code IS NOT NULL AND $2::text IS NOT NULL THEN 0 ELSE 1 END,
        e.created_at DESC
      LIMIT 1
    `,
    [ativoNorm, obraNorm],
  );

  return rows[0] ?? null;
}

export async function findEquipamentoExterno(
  ativo: string,
  obraCodigo?: number | null,
): Promise<EquipamentoExternoRow | null> {
  if (getEquipamentosSupabase()) {
    return findEquipamentoExternoViaSupabase(ativo, obraCodigo);
  }
  return findEquipamentoExternoViaPg(ativo, obraCodigo);
}

async function findEquipamentoExternoByQrTokenViaSupabase(
  qrToken: string,
): Promise<EquipamentoExternoRow | null> {
  const supabase = getEquipamentosSupabase();
  if (!supabase) return null;

  const token = qrToken.trim();
  if (!token) return null;

  const { data, error } = await supabase
    .from("equipments")
    .select(EQUIPMENT_SELECT)
    .eq("active", true)
    .or(`qr_token.eq.${token},id.eq.${token}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapEquipmentRow(data as EquipmentDbRow) : null;
}

async function findEquipamentoExternoByQrTokenViaPg(
  qrToken: string,
): Promise<EquipamentoExternoRow | null> {
  const db = getPgPool();
  if (!db) return null;

  const token = qrToken.trim();
  if (!token) return null;

  const { rows } = await db.query<EquipamentoExternoRow>(
    `
      SELECT
        e.id,
        e.ativo_placa,
        e.qr_token,
        e.name,
        e.company_name,
        o.code AS obra_code,
        c.name AS contract_name
      FROM equipments e
      LEFT JOIN obras o ON o.id = e.obra_id
      LEFT JOIN contracts c ON c.id = e.contract_id
      WHERE e.active = true
        AND (e.qr_token = $1 OR e.id = $1)
      ORDER BY e.created_at DESC
      LIMIT 1
    `,
    [token],
  );

  return rows[0] ?? null;
}

export async function findEquipamentoExternoByQrToken(
  qrToken: string,
): Promise<EquipamentoExternoRow | null> {
  if (getEquipamentosSupabase()) {
    return findEquipamentoExternoByQrTokenViaSupabase(qrToken);
  }
  return findEquipamentoExternoByQrTokenViaPg(qrToken);
}

export async function findEquipamentosExternosBatch(
  itens: { ativo: string; obra_codigo?: number | null }[],
): Promise<Map<string, EquipamentoExternoRow>> {
  const out = new Map<string, EquipamentoExternoRow>();
  for (const item of itens) {
    const key = `${normalizeAtivoPlacaExterno(item.ativo)}:${normalizeObraCodeExterno(item.obra_codigo) ?? ""}`;
    if (out.has(key)) continue;
    const row = await findEquipamentoExterno(item.ativo, item.obra_codigo);
    if (row) out.set(key, row);
  }
  return out;
}
