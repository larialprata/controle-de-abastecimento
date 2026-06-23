import pg from "pg";

export type EquipamentoExternoRow = {
  id: string;
  ativo_placa: string;
  qr_token: string;
  name: string;
  obra_code: string | null;
  company_name: string | null;
};

export function normalizeAtivoPlacaExterno(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

/** Variantes para busca quando o patrimônio pode ter ou não espaço (ex.: EHRER03 ↔ EHRER 03). */
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

let pool: pg.Pool | null = null;

function getPool(): pg.Pool | null {
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
  return Boolean(process.env.EQUIPAMENTOS_DB_URL?.trim());
}

export async function findEquipamentoExterno(
  ativo: string,
  obraCodigo?: number | null,
): Promise<EquipamentoExternoRow | null> {
  const db = getPool();
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
        o.code AS obra_code
      FROM equipments e
      LEFT JOIN obras o ON o.id = e.obra_id
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

export async function findEquipamentoExternoByQrToken(
  qrToken: string,
): Promise<EquipamentoExternoRow | null> {
  const db = getPool();
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
        o.code AS obra_code
      FROM equipments e
      LEFT JOIN obras o ON o.id = e.obra_id
      WHERE e.active = true
        AND (e.qr_token = $1 OR e.id = $1)
      ORDER BY e.created_at DESC
      LIMIT 1
    `,
    [token],
  );

  return rows[0] ?? null;
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
