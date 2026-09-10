export const OBRAS = [
  { codigo: 229, nome: "ECO Barreira" },
  { codigo: 232, nome: "LimpaRio" },
  { codigo: 242, nome: "ATA" },
  { codigo: 243, nome: "ATA" },
  { codigo: 244, nome: "ATA" },
  { codigo: 245, nome: "ATA" },
  { codigo: 246, nome: "ATA" },
  { codigo: 247, nome: "ATA" },
  { codigo: 248, nome: "ATA" },
  { codigo: 249, nome: "ATA" },
  { codigo: 9020, nome: "Usina" },
] as const;

/** Obra Usina: na retirada melosa exige Encerrante Inicial/Final. */
export const OBRA_USINA_CODIGO = 9020;

export type Obra = (typeof OBRAS)[number];

