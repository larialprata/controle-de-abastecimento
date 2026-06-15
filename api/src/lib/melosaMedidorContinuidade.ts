import type { SupabaseClient } from "@supabase/supabase-js";

export type MedidorContinuidadeStatus = "ok" | "desvio";

export function parseMedidorNumero(value: string | null | undefined): number | null {
  const raw = String(value ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function normalizeAtivo(v: string): string {
  return v.trim().toUpperCase();
}

export type UltimoMedidorFinalMelosa = {
  medidor_final: number;
  data_hora: string;
  ativo_equipamento_texto: string | null;
  operation_id: string;
};

export async function findUltimoMedidorFinalMelosa(
  service: SupabaseClient,
  ativoMelosa: string,
  excludeOperationId?: string,
): Promise<UltimoMedidorFinalMelosa | null> {
  const ativo = normalizeAtivo(ativoMelosa);
  if (!ativo) return null;

  const { data, error } = await service
    .from("melosa_movimentacoes")
    .select(
      "operation_id, data_hora, ativo_equipamento_texto, melosa_medidor_acumulado_final_numero, ativo_melosa_texto",
    )
    .not("melosa_medidor_acumulado_final_numero", "is", null)
    .order("data_hora", { ascending: false })
    .limit(50);

  if (error || !data?.length) return null;

  for (const row of data) {
    if (excludeOperationId && row.operation_id === excludeOperationId) continue;
    if (normalizeAtivo(String(row.ativo_melosa_texto ?? "")) !== ativo) continue;
    const medidorFinal = parseMedidorNumero(row.melosa_medidor_acumulado_final_numero);
    if (medidorFinal == null) continue;
    return {
      medidor_final: medidorFinal,
      data_hora: String(row.data_hora),
      ativo_equipamento_texto: row.ativo_equipamento_texto ?? null,
      operation_id: String(row.operation_id),
    };
  }

  return null;
}

export function avaliarContinuidadeMedidorMelosa(
  medidorEsperado: number | null,
  medidorInicialInformado: number,
): {
  status: MedidorContinuidadeStatus;
  medidor_final_anterior: number | null;
  medidor_desvio_litros: number;
} {
  if (medidorEsperado == null) {
    return { status: "ok", medidor_final_anterior: null, medidor_desvio_litros: 0 };
  }
  const desvio = medidorInicialInformado - medidorEsperado;
  if (Math.abs(desvio) < 0.001) {
    return { status: "ok", medidor_final_anterior: medidorEsperado, medidor_desvio_litros: 0 };
  }
  return { status: "desvio", medidor_final_anterior: medidorEsperado, medidor_desvio_litros: desvio };
}

export async function avaliarContinuidadeAbastecimentoMelosa(
  service: SupabaseClient,
  params: {
    ativoMelosa: string;
    medidorInicialInformado: number;
    excludeOperationId?: string;
  },
) {
  const ultimo = await findUltimoMedidorFinalMelosa(service, params.ativoMelosa, params.excludeOperationId);
  const esperado = ultimo?.medidor_final ?? null;
  const avaliacao = avaliarContinuidadeMedidorMelosa(esperado, params.medidorInicialInformado);

  return {
    ...avaliacao,
    medidor_esperado: esperado,
    medidor_informado: params.medidorInicialInformado,
    ultimo_abastecimento: ultimo
      ? {
          data_hora: ultimo.data_hora,
          ativo_equipamento: ultimo.ativo_equipamento_texto,
          operation_id: ultimo.operation_id,
        }
      : null,
  };
}
