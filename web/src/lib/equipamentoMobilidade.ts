export type EquipamentoMobilidade = "ESTACIONARIO" | "MOVEL";

/** Geradores = estacionário; demais equipamentos = móvel. */
export function inferMobilidadeFromNome(nome: string | null | undefined): EquipamentoMobilidade {
  const n = (nome ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (/\bgerador(es)?\b/.test(n) || n.includes("gerador")) {
    return "ESTACIONARIO";
  }
  return "MOVEL";
}

export function resolveMobilidadeEquipamento(
  nome: string | null | undefined,
  explicit: EquipamentoMobilidade | null | undefined,
): EquipamentoMobilidade {
  if (explicit === "ESTACIONARIO" || explicit === "MOVEL") return explicit;
  return inferMobilidadeFromNome(nome);
}
