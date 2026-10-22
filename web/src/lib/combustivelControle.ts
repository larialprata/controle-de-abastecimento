/**
 * Fechamento caminhão-melosa / tanque principal.
 * Margem operacional aceitável cobre deslocamento do caminhão e fundo de tanque (volume mínimo no medidor).
 */

export type CombustivelControleInputs = {
  entradaTanque: number;
  retiradaMelosa: number;
  abastecimentosEquipamentos: number;
  devolvidoTanque: number;
  limiteAceitavelPct: number;
};

export type CombustivelControleStatus = "ok" | "suspeita" | "sem_retirada";

export type CombustivelControleResult = {
  volumeJustificado: number;
  diferencaLitros: number;
  diferencaPct: number | null;
  margemOperacionalLitros: number;
  volumeSuspeito: number;
  status: CombustivelControleStatus;
  saldoTanque: number;
  saldoMelosa: number;
};

/** Massa de teste do negócio: diferença 272L (5,44%), saldo tanque 8125L, ~97L suspeitos. */
export function calcularCombustivelControle(inputs: CombustivelControleInputs): CombustivelControleResult {
  const {
    entradaTanque,
    retiradaMelosa,
    abastecimentosEquipamentos,
    devolvidoTanque,
    limiteAceitavelPct,
  } = inputs;

  const volumeJustificado = abastecimentosEquipamentos + devolvidoTanque;
  const diferencaLitros = retiradaMelosa - volumeJustificado;
  const diferencaPct = retiradaMelosa > 0 ? (diferencaLitros / retiradaMelosa) * 100 : null;
  const margemOperacionalLitros = (limiteAceitavelPct * retiradaMelosa) / 100;

  let volumeSuspeito = 0;
  let status: CombustivelControleStatus = "sem_retirada";

  if (retiradaMelosa > 0) {
    if (diferencaPct != null && diferencaPct > limiteAceitavelPct) {
      status = "suspeita";
      volumeSuspeito = Math.max(0, diferencaLitros - margemOperacionalLitros);
    } else {
      status = "ok";
    }
  }

  const saldoTanque = entradaTanque - retiradaMelosa + devolvidoTanque;
  const saldoMelosa = retiradaMelosa - abastecimentosEquipamentos - devolvidoTanque;

  return {
    volumeJustificado,
    diferencaLitros,
    diferencaPct,
    margemOperacionalLitros,
    volumeSuspeito,
    status,
    saldoTanque,
    saldoMelosa,
  };
}

/**
 * Número digitado no padrão brasileiro.
 * 7.500 = 7500, 10.000 = 10000, 6,10 = 6.1, 125.4 = 125.4.
 */
export function parseNumeroPtBr(value: string): number | null {
  let s = value.trim().replace(/\s/g, "").replace(/^R\$/i, "");
  if (!s) return null;
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function fmtLitrosDashboard(v: number, frac = 2): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: frac,
  }).format(v);
}

export function fmtPctDashboard(v: number | null, frac = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: frac }).format(v)}%`;
}

/** Saída da melosa entre sobra contábil e leitura ao chegar (consumo do caminhão / deslocamento). */
export type SaidaMelosaAntesChegarAnalise = {
  consumoGasolinaAceitavelLitros: number;
  litrosSaidaPct: number | null;
  volumeSuspeitoLitros: number;
  status: "ok" | "suspeita" | "na";
};

export function calcSaidaMelosaAntesChegar(
  sobraContabilLitros: number,
  litrosSaida: number,
  limiteAceitavelPct: number,
): SaidaMelosaAntesChegarAnalise {
  if (sobraContabilLitros <= 0 || litrosSaida <= 0.05) {
    return {
      consumoGasolinaAceitavelLitros: 0,
      litrosSaidaPct: null,
      volumeSuspeitoLitros: 0,
      status: "na",
    };
  }

  const consumoGasolinaAceitavelLitros = (limiteAceitavelPct * sobraContabilLitros) / 100;
  const litrosSaidaPct = (litrosSaida / sobraContabilLitros) * 100;
  const acimaLimite = litrosSaidaPct > limiteAceitavelPct;
  const volumeSuspeitoLitros = acimaLimite
    ? Math.max(0, litrosSaida - consumoGasolinaAceitavelLitros)
    : 0;

  return {
    consumoGasolinaAceitavelLitros,
    litrosSaidaPct,
    volumeSuspeitoLitros,
    status: acimaLimite ? "suspeita" : "ok",
  };
}
