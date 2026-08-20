/** Convenção SharePoint: {ano}/{mês}/{tipo}/{ativo}-{data}.ext */

export type PhotoKindFolder =
  | "Assinaturas"
  | "Operador"
  | "Qnt. Com"
  | "Horímetro"
  | "Lacres"
  | "Notas"
  | "CNH"
  | "Outros";

/** Paths novos: 2026/08/Qnt. Com/... */
const ORGANIZED_PATH_RE = /^\d{4}\/\d{2}\//;
/** Paths intermediários: 2026/08/2026-08-20-123/... */
const DAY_OBRA_PATH_RE = /^\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}-/;
/** Paths da 1ª migração: 2026-08/... */
const LEGACY_MONTH_PATH_RE = /^\d{4}-\d{2}\//;

export function isMonthOrganizedStoragePath(path: string): boolean {
  const p = path.trim().replace(/^\/+/, "");
  return ORGANIZED_PATH_RE.test(p) || LEGACY_MONTH_PATH_RE.test(p);
}

/** Já está no layout final (ano/mês/tipo/arquivo), sem pasta (data)-(obra). */
export function isFinalMonthKindLayout(path: string): boolean {
  const p = path.trim().replace(/^\/+/, "");
  if (!ORGANIZED_PATH_RE.test(p)) return false;
  if (DAY_OBRA_PATH_RE.test(p)) return false;
  const parts = p.split("/");
  // 2026/08/Qnt. Com/arquivo.jpg → 4 segmentos
  return parts.length >= 4;
}

export function sanitizeAtivoLabel(raw: string | null | undefined): string {
  const base = String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase()
    .slice(0, 48);
  return base || "SEM-ATIVO";
}

export function formatDataLabel(iso: string | Date | null | undefined): string {
  const d = iso instanceof Date ? iso : new Date(String(iso ?? ""));
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return [
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function extFromPathOrContentType(path: string, contentType?: string | null): string {
  const fromPath = path.split(".").pop()?.toLowerCase();
  if (fromPath && /^[a-z0-9]{2,5}$/.test(fromPath) && fromPath !== "storage_path") {
    if (fromPath === "jpeg") return "jpg";
    return fromPath;
  }
  const ct = String(contentType ?? "").toLowerCase();
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  return "jpg";
}

/** Mapeia kind interno → pasta no SharePoint. */
export function photoKindToFolder(kind: string): PhotoKindFolder {
  const k = String(kind || "")
    .toLowerCase()
    .replace(/_/g, "-")
    .trim();

  if (k === "quantidade" || k === "qnt-com" || k === "qnt.com" || k === "qnt com") return "Qnt. Com";
  if (k === "horimetro" || k === "horímetro") return "Horímetro";
  if (k === "operador" || k === "equipamento-operador") return "Operador";
  // todas as assinaturas na mesma pasta
  if (
    k === "assinatura-operador" ||
    k === "assinatura-motorista" ||
    k === "assinatura-melosa" ||
    k === "assinaturas" ||
    k === "assinatura"
  ) {
    return "Assinaturas";
  }
  if (k.startsWith("lacre")) return "Lacres";
  if (k === "nota" || k === "notas") return "Notas";
  if (k === "cnh") return "CNH";
  return "Outros";
}

/**
 * Path relativo no Postgres / sob SHAREPOINT_FOLDER_OPERATION:
 *   2026/08/Qnt. Com/EQUIP123-2026-08-20.jpg
 */
export function buildMonthOrganizedStoragePath(input: {
  ativo: string | null | undefined;
  dataHora: string | Date | null | undefined;
  kind: string;
  ext: string;
  uniqueSuffix?: string;
  /** ignorado — mantido por compat */
  obra?: string | number | null | undefined;
  tipo?: string | null;
  fase?: string | null;
}): string {
  const data = formatDataLabel(input.dataHora);
  const year = data.slice(0, 4);
  const month = data.slice(5, 7);
  const kindFolder = photoKindToFolder(input.kind);
  const ativo = sanitizeAtivoLabel(input.ativo);
  const ext = (input.ext || "jpg").replace(/^\./, "").toLowerCase();
  const uniq = input.uniqueSuffix
    ? `-${String(input.uniqueSuffix).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)}`
    : "";

  const kindSlug = String(input.kind || "foto")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  // Assinaturas (2 tipos) e Lacres: inclui tipo no nome para não sobrescrever
  const needsKindInName =
    kindFolder === "Assinaturas" ||
    kindFolder === "Lacres" ||
    kindFolder === "Notas" ||
    kindFolder === "Outros" ||
    kindFolder === "CNH";

  const fileName = needsKindInName
    ? `${ativo}-${data}-${kindSlug}${uniq}.${ext}`
    : `${ativo}-${data}${uniq}.${ext}`;

  return `${year}/${month}/${kindFolder}/${fileName}`;
}
