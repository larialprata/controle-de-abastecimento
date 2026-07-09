export type EquipamentoMobilidade = "ESTACIONARIO" | "MOVEL";

/** Padrão: todo equipamento é móvel, salvo indicação explícita de estacionário. */
export function inferMobilidadeFromNome(_nome?: string | null | undefined): EquipamentoMobilidade {
  return "MOVEL";
}

export function resolveMobilidadeEquipamento(
  _nome: string | null | undefined,
  explicit: EquipamentoMobilidade | null | undefined,
): EquipamentoMobilidade {
  return explicit === "ESTACIONARIO" ? "ESTACIONARIO" : "MOVEL";
}
