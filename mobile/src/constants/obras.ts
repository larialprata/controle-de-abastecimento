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
] as const;

export type Obra = (typeof OBRAS)[number];

