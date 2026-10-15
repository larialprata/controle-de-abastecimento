import { listTanqueAtivosForObra } from "./tanqueObras";
import type { createSupabaseServiceRole } from "./supabase";

type Service = ReturnType<typeof createSupabaseServiceRole>;

const OLEOS: Array<{ codigo: string; tokens: string[] }> = [
  { codigo: "XP_68", tokens: ["XP68"] },
  { codigo: "15W40", tokens: ["15W40"] },
  { codigo: "10W30", tokens: ["10W30"] },
  { codigo: "140_MINERAL", tokens: ["140MINERAL"] },
  { codigo: "ARLA_32", tokens: ["ARLA"] },
  { codigo: "ATF", tokens: ["ATF"] },
];

export function compactOleo(raw: unknown): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Código do óleo (XP_68, 15W40, …) a partir do insumo ou do nome do tanque. */
export function codigoOleoPorTexto(raw: unknown): string | null {
  const key = compactOleo(raw);
  if (!key || key.includes("DIESEL") || key.includes("GASOLINA") || key.includes("ALCOOL")) return null;
  for (const oleo of OLEOS) {
    if (oleo.tokens.some((token) => key.includes(token))) return oleo.codigo;
  }
  return null;
}

/**
 * Se o insumo é um óleo e existe tanque com esse nome na obra, devolve o número desse tanque.
 * Caso contrário mantém o tanque escolhido.
 */
export async function resolverTanqueNumeroDoInsumo(
  service: Service,
  obraCodigo: number,
  tanqueNumero: number,
  combustivelTipo: string | null | undefined,
): Promise<number> {
  const oleo = codigoOleoPorTexto(combustivelTipo);
  if (!oleo) return tanqueNumero;

  const { data, error } = await service
    .from("equipamentos")
    .select("ativo, nome, obra_codigo, tanque_numero")
    .eq("tipo", "TANQUE");
  if (error || !data?.length) return tanqueNumero;

  const ativosObra = new Set(await listTanqueAtivosForObra(service, obraCodigo));
  const candidatos = data.filter((row) => {
    const ativo = String(row.ativo ?? "");
    const naObra = ativosObra.size > 0 ? ativosObra.has(ativo) : Number(row.obra_codigo) === obraCodigo;
    const numero = Number(row.tanque_numero);
    return naObra && Number.isFinite(numero) && numero > 0 && codigoOleoPorTexto(row.nome) === oleo;
  });
  if (candidatos.length === 0) return tanqueNumero;
  const mesmo = candidatos.find((row) => Number(row.tanque_numero) === tanqueNumero);
  return Number((mesmo ?? candidatos[0]).tanque_numero);
}
