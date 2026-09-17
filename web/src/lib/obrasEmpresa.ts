export const OBRA_EMPRESAS = ["DIMENSIONAL", "DELURB", "SPE_IGARATA"] as const;
export type ObraEmpresa = (typeof OBRA_EMPRESAS)[number];

export const EMPRESA_LABEL: Record<ObraEmpresa, string> = {
  DIMENSIONAL: "Dimensional",
  DELURB: "Delurb",
  SPE_IGARATA: "SPE Igarata Ltda",
};

export type ObraComEmpresa = {
  codigo: number;
  nome: string;
  empresa: ObraEmpresa | null;
};

export function obraCodigosDaEmpresa(
  obras: ObraComEmpresa[],
  empresa: ObraEmpresa | "" | null | undefined,
): Set<number> | null {
  if (!empresa) return null;
  return new Set(obras.filter((o) => o.empresa === empresa).map((o) => o.codigo));
}

export function filtrarObrasPorEmpresa(
  obras: ObraComEmpresa[],
  empresa: ObraEmpresa | "" | null | undefined,
): ObraComEmpresa[] {
  if (!empresa) return obras;
  return obras.filter((o) => o.empresa === empresa);
}

export function empresaDaObra(
  obras: ObraComEmpresa[],
  obraCodigo: number | null | undefined,
): ObraEmpresa | null {
  if (obraCodigo == null) return null;
  return obras.find((o) => o.codigo === obraCodigo)?.empresa ?? null;
}

export function empresasDasLinhas(
  obras: ObraComEmpresa[],
  obraCodigos: Array<number | null | undefined>,
): Set<ObraEmpresa> {
  const out = new Set<ObraEmpresa>();
  obraCodigos.forEach((cod) => {
    const e = empresaDaObra(obras, typeof cod === "number" ? cod : null);
    if (e) out.add(e);
  });
  return out;
}
