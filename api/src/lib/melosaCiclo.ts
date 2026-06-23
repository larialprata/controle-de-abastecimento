import type { SupabaseClient } from "@supabase/supabase-js";

export type MelosaCicloStatus = "ok" | "suspeito";

export type MelosaCicloRow = {
  id: string;
  ciclo_numero: number;
  ativo_melosa_texto: string;
  obra_codigo: number | null;
  retirada_operation_id: string;
  ciclo_anterior_id: string | null;
  ciclo_anterior_numero: number | null;
  data_hora: string;
  litros_retirada: number;
  litros_sobra_anterior: number;
  litros_abastecidos: number;
  litros_devolvidos: number;
  capacidade_litros: number | null;
  volume_excedente: number;
  status: MelosaCicloStatus;
};

function normalizeAtivo(v: string): string {
  return v.trim().toUpperCase();
}

function toNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

async function findCapacidadeMelosa(
  service: SupabaseClient,
  ativoMelosa: string,
): Promise<number | null> {
  const ativo = normalizeAtivo(ativoMelosa);
  const { data } = await service
    .from("equipamentos")
    .select("capacidade_litros, ativo, tipo")
    .eq("tipo", "MELOSA");

  if (!data?.length) return null;
  const row = data.find((r) => normalizeAtivo(String(r.ativo ?? "")) === ativo);
  if (!row) return null;
  const cap = toNum(row.capacidade_litros);
  return cap > 0 ? cap : null;
}

async function findCicloAnteriorMesmoAtivo(
  service: SupabaseClient,
  ativoMelosa: string,
): Promise<MelosaCicloRow | null> {
  const ativo = normalizeAtivo(ativoMelosa);
  const { data, error } = await service
    .from("melosa_ciclos")
    .select("*")
    .ilike("ativo_melosa_texto", ativo)
    .order("ciclo_numero", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as MelosaCicloRow;
}

async function sumAbastecimentosEntre(
  service: SupabaseClient,
  ativoMelosa: string,
  de: string,
  ate: string,
): Promise<number> {
  const ativo = normalizeAtivo(ativoMelosa);
  const { data } = await service
    .from("melosa_movimentacoes")
    .select("litros, ativo_melosa_texto, data_hora")
    .gt("data_hora", de)
    .lt("data_hora", ate);

  if (!data?.length) return 0;
  return data
    .filter((r) => normalizeAtivo(String(r.ativo_melosa_texto ?? "")) === ativo)
    .reduce((acc, r) => acc + toNum(r.litros), 0);
}

async function sumDevolucoesEntre(
  service: SupabaseClient,
  ativoMelosa: string,
  de: string,
  ate: string,
): Promise<number> {
  const ativo = normalizeAtivo(ativoMelosa);
  const { data } = await service
    .from("movimentacoes")
    .select("litros, placa_texto, placa_caminhao, tipo, data_hora")
    .eq("tipo", "ENTRADA_TANQUE_OBRA")
    .gt("data_hora", de)
    .lt("data_hora", ate);

  if (!data?.length) return 0;
  return data
    .filter((r) => {
      const placa = normalizeAtivo(String(r.placa_texto ?? r.placa_caminhao ?? ""));
      return placa === ativo;
    })
    .reduce((acc, r) => acc + toNum(r.litros), 0);
}

export function calcularSobraAnterior(
  litrosRetiradaAnterior: number,
  litrosAbastecidos: number,
  litrosDevolvidos: number,
): number {
  return Math.max(0, litrosRetiradaAnterior - litrosAbastecidos - litrosDevolvidos);
}

export function avaliarEnchimentoMelosa(
  litrosSobraAnterior: number,
  litrosNovaRetirada: number,
  capacidadeLitros: number | null,
): { volumeExcedente: number; status: MelosaCicloStatus } {
  if (capacidadeLitros == null || capacidadeLitros <= 0) {
    return { volumeExcedente: 0, status: "ok" };
  }
  const totalAposEnchimento = litrosSobraAnterior + litrosNovaRetirada;
  if (totalAposEnchimento > capacidadeLitros) {
    return {
      volumeExcedente: totalAposEnchimento - capacidadeLitros,
      status: "suspeito",
    };
  }
  return { volumeExcedente: 0, status: "ok" };
}

async function findCicloByRetiradaOperationId(
  service: SupabaseClient,
  operationId: string,
): Promise<MelosaCicloRow | null> {
  const { data, error } = await service
    .from("melosa_ciclos")
    .select("*")
    .eq("retirada_operation_id", operationId)
    .maybeSingle();

  if (error || !data) return null;
  return data as MelosaCicloRow;
}

export async function criarCicloRetiradaTanque(
  service: SupabaseClient,
  params: {
    operationId: string;
    ativoMelosa: string;
    obraCodigo: number;
    dataHora: string;
    litrosRetirada: number;
  },
): Promise<MelosaCicloRow> {
  const ativo = normalizeAtivo(params.ativoMelosa);
  if (!ativo) throw new Error("Ativo da melosa obrigatório para gerar ciclo.");

  const existente = await findCicloByRetiradaOperationId(service, params.operationId);
  if (existente) {
    await service
      .from("movimentacoes")
      .update({ ciclo_id: existente.id })
      .eq("operation_id", params.operationId);
    return existente;
  }

  const capacidade = await findCapacidadeMelosa(service, ativo);
  const cicloAnterior = await findCicloAnteriorMesmoAtivo(service, ativo);

  let litrosSobraAnterior = 0;
  if (cicloAnterior) {
    const abast = await sumAbastecimentosEntre(
      service,
      ativo,
      cicloAnterior.data_hora,
      params.dataHora,
    );
    const devolv = await sumDevolucoesEntre(service, ativo, cicloAnterior.data_hora, params.dataHora);
    litrosSobraAnterior = calcularSobraAnterior(toNum(cicloAnterior.litros_retirada), abast, devolv);
  }

  const { volumeExcedente, status } = avaliarEnchimentoMelosa(
    litrosSobraAnterior,
    params.litrosRetirada,
    capacidade,
  );

  const { data: cicloNumero, error: seqErr } = await service.rpc("next_melosa_ciclo_numero");
  if (seqErr || cicloNumero == null) {
    throw new Error(seqErr?.message ?? "Falha ao gerar número do ciclo.");
  }

  const insertRow = {
    ciclo_numero: Number(cicloNumero),
    ativo_melosa_texto: ativo,
    obra_codigo: params.obraCodigo,
    retirada_operation_id: params.operationId,
    ciclo_anterior_id: cicloAnterior?.id ?? null,
    ciclo_anterior_numero: cicloAnterior?.ciclo_numero ?? null,
    data_hora: params.dataHora,
    litros_retirada: params.litrosRetirada,
    litros_sobra_anterior: litrosSobraAnterior,
    litros_abastecidos: 0,
    litros_devolvidos: 0,
    capacidade_litros: capacidade,
    volume_excedente: volumeExcedente,
    status,
  };

  const { data: ciclo, error: insErr } = await service
    .from("melosa_ciclos")
    .insert(insertRow)
    .select("*")
    .single();

  if (insErr || !ciclo) {
    const duplicate =
      insErr?.code === "23505" ||
      String(insErr?.message ?? "")
        .toLowerCase()
        .includes("melosa_ciclos_retirada_operation_id_key");
    if (duplicate) {
      const retry = await findCicloByRetiradaOperationId(service, params.operationId);
      if (retry) {
        await service
          .from("movimentacoes")
          .update({ ciclo_id: retry.id })
          .eq("operation_id", params.operationId);
        return retry;
      }
    }
    throw new Error(insErr?.message ?? "Falha ao criar ciclo da melosa.");
  }

  const { error: updMovErr } = await service
    .from("movimentacoes")
    .update({ ciclo_id: ciclo.id })
    .eq("operation_id", params.operationId);

  if (updMovErr) {
    throw new Error(updMovErr.message);
  }

  return ciclo as MelosaCicloRow;
}

export async function vincularAbastecimentoAoCicloAberto(
  service: SupabaseClient,
  params: {
    operationId: string;
    ativoMelosa: string;
    litrosAbastecidos: number;
  },
): Promise<string | null> {
  const ativo = normalizeAtivo(params.ativoMelosa);
  const ciclo = await findCicloAnteriorMesmoAtivo(service, ativo);
  if (!ciclo) return null;

  const { error: updErr } = await service
    .from("melosa_movimentacoes")
    .update({ ciclo_id: ciclo.id })
    .eq("operation_id", params.operationId);

  if (updErr) throw new Error(updErr.message);

  const novoAbast = toNum(ciclo.litros_abastecidos) + params.litrosAbastecidos;
  await service.from("melosa_ciclos").update({ litros_abastecidos: novoAbast }).eq("id", ciclo.id);

  return ciclo.id;
}

export function litrosSobraAtualCiclo(ciclo: MelosaCicloRow): number {
  return Math.max(
    0,
    toNum(ciclo.litros_retirada) - toNum(ciclo.litros_abastecidos) - toNum(ciclo.litros_devolvidos),
  );
}

/** Ao excluir um ciclo, os filhos passam a apontar para o anterior do excluído e recalculam sobra/status. */
export async function relinkFilhosAoExcluirCiclo(
  service: SupabaseClient,
  cicloExcluido: Pick<
    MelosaCicloRow,
    "id" | "ativo_melosa_texto" | "ciclo_anterior_id" | "ciclo_anterior_numero" | "data_hora"
  >,
): Promise<number> {
  const { data: filhos, error: filhosErr } = await service
    .from("melosa_ciclos")
    .select("*")
    .eq("ciclo_anterior_id", cicloExcluido.id);

  if (filhosErr) throw new Error(filhosErr.message);
  if (!filhos?.length) return 0;

  let atualizados = 0;
  for (const filho of filhos as MelosaCicloRow[]) {
    const novoAnteriorId = cicloExcluido.ciclo_anterior_id;
    const novoAnteriorNumero = cicloExcluido.ciclo_anterior_numero;

    let litrosSobraAnterior = 0;
    if (novoAnteriorId) {
      const { data: anterior } = await service
        .from("melosa_ciclos")
        .select("*")
        .eq("id", novoAnteriorId)
        .maybeSingle();
      if (anterior) {
        const abast = await sumAbastecimentosEntre(
          service,
          filho.ativo_melosa_texto,
          String(anterior.data_hora),
          filho.data_hora,
        );
        const devolv = await sumDevolucoesEntre(
          service,
          filho.ativo_melosa_texto,
          String(anterior.data_hora),
          filho.data_hora,
        );
        litrosSobraAnterior = calcularSobraAnterior(
          toNum((anterior as MelosaCicloRow).litros_retirada),
          abast,
          devolv,
        );
      }
    }

    const capacidade =
      filho.capacidade_litros != null && toNum(filho.capacidade_litros) > 0
        ? toNum(filho.capacidade_litros)
        : await findCapacidadeMelosa(service, filho.ativo_melosa_texto);

    const { volumeExcedente, status } = avaliarEnchimentoMelosa(
      litrosSobraAnterior,
      toNum(filho.litros_retirada),
      capacidade,
    );

    const { error: updErr } = await service
      .from("melosa_ciclos")
      .update({
        ciclo_anterior_id: novoAnteriorId,
        ciclo_anterior_numero: novoAnteriorNumero,
        litros_sobra_anterior: litrosSobraAnterior,
        volume_excedente: volumeExcedente,
        status,
        capacidade_litros: capacidade,
      })
      .eq("id", filho.id);

    if (updErr) throw new Error(updErr.message);
    atualizados += 1;
  }

  return atualizados;
}
