/** Tanque vinculado a uma ou mais obras (API GET tipo=TANQUE). */
export type TanqueComObras = {
  obra_codigo?: number | null;
  obra_codigos?: number[] | null;
  tanque_numero?: number | null;
};

export function obraCodigosDoTanque(t: TanqueComObras): number[] {
  if (Array.isArray(t.obra_codigos) && t.obra_codigos.length > 0) {
    return t.obra_codigos.map(Number).filter((c) => Number.isFinite(c));
  }
  if (t.obra_codigo != null && Number.isFinite(Number(t.obra_codigo))) {
    return [Number(t.obra_codigo)];
  }
  return [];
}

export function tanquePertenceAObra(t: TanqueComObras, obraCodigo: number): boolean {
  return obraCodigosDoTanque(t).includes(obraCodigo);
}
