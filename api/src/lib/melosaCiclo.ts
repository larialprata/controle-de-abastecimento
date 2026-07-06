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
  alerta_oculto?: boolean;
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

function sumMovimentacoesNoIntervalo(
  movimentacoes: Array<{ litros: number; data_hora: string }>,
  de: string,
  ate: string | null,
): number {
  return movimentacoes
    .filter((m) => m.data_hora > de && (ate == null || m.data_hora < ate))
    .reduce((acc, m) => acc + m.litros, 0);
}

async function fetchMovimentacoesMelosaDesde(
  service: SupabaseClient,
  ativoMelosa: string,
  de: string,
): Promise<Array<{ litros: number; data_hora: string }>> {
  const ativo = normalizeAtivo(ativoMelosa);
  const { data } = await service
    .from("melosa_movimentacoes")
    .select("litros, ativo_melosa_texto, data_hora")
    .ilike("ativo_melosa_texto", ativo)
    .gt("data_hora", de)
    .order("data_hora", { ascending: true });

  if (!data?.length) return [];
  return data.map((r) => ({
    litros: toNum(r.litros),
    data_hora: String(r.data_hora),
  }));
}

async function sumAbastecimentosEntre(
  service: SupabaseClient,
  ativoMelosa: string,
  de: string,
  ate: string | null,
): Promise<number> {
  const movs = await fetchMovimentacoesMelosaDesde(service, ativoMelosa, de);
  return sumMovimentacoesNoIntervalo(movs, de, ate);
}

/** Volume na melosa logo após o enchimento do ciclo (sobra anterior + retirada do tanque). */
export function litrosDisponivelNoCiclo(
  ciclo: Pick<MelosaCicloRow, "litros_sobra_anterior" | "litros_retirada">,
): number {
  return toNum(ciclo.litros_sobra_anterior) + toNum(ciclo.litros_retirada);
}

/** Sobra restante após abastecimentos no intervalo (ex.: entre dois enchimentos). */
export function calcularSobraAposAbastecimentos(
  litrosDisponivelNoCiclo: number,
  litrosAbastecidosNoIntervalo: number,
): number {
  return Math.max(0, litrosDisponivelNoCiclo - litrosAbastecidosNoIntervalo);
}

/** @deprecated Use litrosDisponivelNoCiclo + calcularSobraAposAbastecimentos */
export function calcularSobraAnterior(
  litrosRetiradaAnterior: number,
  litrosAbastecidos: number,
  _litrosDevolvidos = 0,
): number {
  return calcularSobraAposAbastecimentos(litrosRetiradaAnterior, litrosAbastecidos);
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
    litrosSobraAnterior = calcularSobraAposAbastecimentos(litrosDisponivelNoCiclo(cicloAnterior), abast);
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

  const { data: proximoCiclo } = await service
    .from("melosa_ciclos")
    .select("data_hora")
    .ilike("ativo_melosa_texto", ativo)
    .gt("ciclo_numero", ciclo.ciclo_numero)
    .order("ciclo_numero", { ascending: true })
    .limit(1)
    .maybeSingle();

  const abastRecalculado = await sumAbastecimentosEntre(
    service,
    ativo,
    ciclo.data_hora,
    proximoCiclo?.data_hora ?? null,
  );
  await service.from("melosa_ciclos").update({ litros_abastecidos: abastRecalculado }).eq("id", ciclo.id);

  return ciclo.id;
}

export function litrosSobraAtualCiclo(
  ciclo: Pick<MelosaCicloRow, "litros_sobra_anterior" | "litros_retirada" | "litros_abastecidos">,
): number {
  return calcularSobraAposAbastecimentos(litrosDisponivelNoCiclo(ciclo), toNum(ciclo.litros_abastecidos));
}

export type CicloMetricasEnriquecidas = {
  litros_sobra_anterior: number;
  litros_abastecidos: number;
  litros_sobra_atual: number;
};

/** Recalcula sobra anterior, abastecido e sobra atual a partir das movimentações da melosa. */
export async function enriquecerCiclosParaListagem(
  service: SupabaseClient,
  ciclos: MelosaCicloRow[],
): Promise<Map<string, CicloMetricasEnriquecidas>> {
  const resultado = new Map<string, CicloMetricasEnriquecidas>();
  if (ciclos.length === 0) return resultado;

  const ativos = Array.from(new Set(ciclos.map((c) => normalizeAtivo(c.ativo_melosa_texto))));

  for (const ativo of ativos) {
    const { data: chainData } = await service
      .from("melosa_ciclos")
      .select("*")
      .ilike("ativo_melosa_texto", ativo)
      .order("ciclo_numero", { ascending: true });

    const chain = (chainData ?? []) as MelosaCicloRow[];
    if (!chain.length) continue;

    const movimentacoes = await fetchMovimentacoesMelosaDesde(service, ativo, chain[0].data_hora);

    for (let i = 0; i < chain.length; i++) {
      const ciclo = chain[i];
      const ateAbast = chain[i + 1]?.data_hora ?? null;
      const abast = sumMovimentacoesNoIntervalo(movimentacoes, ciclo.data_hora, ateAbast);

      let sobraAnterior = 0;
      if (i > 0) {
        const anterior = chain[i - 1];
        const abastEntreCiclos = sumMovimentacoesNoIntervalo(
          movimentacoes,
          anterior.data_hora,
          ciclo.data_hora,
        );
        sobraAnterior = calcularSobraAposAbastecimentos(
          litrosDisponivelNoCiclo(anterior),
          abastEntreCiclos,
        );
      }

      const sobraAtual = calcularSobraAposAbastecimentos(litrosDisponivelNoCiclo({ ...ciclo, litros_sobra_anterior: sobraAnterior }), abast);

      resultado.set(ciclo.id, {
        litros_sobra_anterior: sobraAnterior,
        litros_abastecidos: abast,
        litros_sobra_atual: sobraAtual,
      });
    }
  }

  return resultado;
}

/** Encontra o ciclo anterior ainda existente, ignorando IDs já excluídos ou ausentes. */
export async function resolverCicloAnteriorValido(
  service: SupabaseClient,
  anteriorId: string | null,
  idsIgnorados: Set<string> = new Set(),
): Promise<{ id: string | null; numero: number | null }> {
  let cur = anteriorId;
  const visitados = new Set<string>();

  while (cur) {
    if (visitados.has(cur)) break;
    visitados.add(cur);

    if (idsIgnorados.has(cur)) {
      const { data } = await service
        .from("melosa_ciclos")
        .select("ciclo_anterior_id")
        .eq("id", cur)
        .maybeSingle();
      cur = data?.ciclo_anterior_id ?? null;
      continue;
    }

    const { data } = await service
      .from("melosa_ciclos")
      .select("id, ciclo_anterior_numero")
      .eq("id", cur)
      .maybeSingle();
    if (!data) return { id: null, numero: null };
    return { id: data.id, numero: data.ciclo_anterior_numero ?? null };
  }

  return { id: null, numero: null };
}

/** Ao excluir um ciclo, os filhos passam a apontar para o anterior do excluído e recalculam sobra/status. */
export async function relinkFilhosAoExcluirCiclo(
  service: SupabaseClient,
  cicloExcluido: Pick<
    MelosaCicloRow,
    "id" | "ativo_melosa_texto" | "ciclo_anterior_id" | "ciclo_anterior_numero" | "data_hora"
  >,
  idsIgnorados: Set<string> = new Set(),
): Promise<number> {
  const ignorados = new Set(idsIgnorados);
  ignorados.add(cicloExcluido.id);

  const { data: filhos, error: filhosErr } = await service
    .from("melosa_ciclos")
    .select("*")
    .eq("ciclo_anterior_id", cicloExcluido.id);

  if (filhosErr) throw new Error(filhosErr.message);
  if (!filhos?.length) return 0;

  const { id: novoAnteriorId, numero: novoAnteriorNumero } = await resolverCicloAnteriorValido(
    service,
    cicloExcluido.ciclo_anterior_id,
    ignorados,
  );

  let atualizados = 0;
  for (const filho of filhos as MelosaCicloRow[]) {
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
        litrosSobraAnterior = calcularSobraAposAbastecimentos(
          litrosDisponivelNoCiclo(anterior as MelosaCicloRow),
          abast,
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

export async function excluirMelosaCiclo(
  service: SupabaseClient,
  id: string,
  idsIgnorados: Set<string> = new Set(),
): Promise<{
  id: string;
  ciclo_numero: number;
  ativo_melosa_texto: string;
  filhos_atualizados: number;
}> {
  const { data: ciclo, error: findErr } = await service
    .from("melosa_ciclos")
    .select(
      "id, ciclo_numero, retirada_operation_id, ativo_melosa_texto, ciclo_anterior_id, ciclo_anterior_numero, data_hora",
    )
    .eq("id", id)
    .maybeSingle();

  if (findErr) throw new Error(findErr.message);
  if (!ciclo) throw new Error("Ciclo não encontrado");

  const filhosAtualizados = await relinkFilhosAoExcluirCiclo(
    service,
    ciclo as MelosaCicloRow,
    idsIgnorados,
  );

  const { error: unlinkMelosaErr } = await service
    .from("melosa_movimentacoes")
    .update({ ciclo_id: null })
    .eq("ciclo_id", id);
  if (unlinkMelosaErr) throw new Error(unlinkMelosaErr.message);

  const { error: unlinkMovErr } = await service
    .from("movimentacoes")
    .update({ ciclo_id: null })
    .eq("ciclo_id", id);
  if (unlinkMovErr) throw new Error(unlinkMovErr.message);

  const { error: deleteRetiradaErr } = await service
    .from("movimentacoes")
    .delete()
    .eq("operation_id", ciclo.retirada_operation_id);
  if (deleteRetiradaErr) throw new Error(deleteRetiradaErr.message);

  const { error: deleteCicloErr } = await service.from("melosa_ciclos").delete().eq("id", id);
  if (deleteCicloErr) throw new Error(deleteCicloErr.message);

  return {
    id,
    ciclo_numero: ciclo.ciclo_numero,
    ativo_melosa_texto: ciclo.ativo_melosa_texto,
    filhos_atualizados: filhosAtualizados,
  };
}

export async function excluirMelosaCiclosEmLote(
  service: SupabaseClient,
  ids: string[],
): Promise<Array<{ id: string; ciclo_numero: number; ativo_melosa_texto: string; filhos_atualizados: number }>> {
  const unicos = Array.from(new Set(ids.map((x) => x.trim()).filter(Boolean)));
  if (unicos.length === 0) return [];

  const { data: rows, error } = await service
    .from("melosa_ciclos")
    .select("id, ciclo_numero")
    .in("id", unicos);
  if (error) throw new Error(error.message);

  const ordenados = [...(rows ?? [])].sort((a, b) => b.ciclo_numero - a.ciclo_numero);
  const idsIgnorados = new Set(unicos);
  const resultados = [];

  for (const row of ordenados) {
    resultados.push(await excluirMelosaCiclo(service, row.id, idsIgnorados));
  }

  return resultados;
}

export async function atualizarCicloAlerta(
  service: SupabaseClient,
  cicloId: string,
  opts: { alerta_oculto?: boolean; capacidade_litros?: number | null },
): Promise<MelosaCicloRow & { alerta_oculto: boolean }> {
  const { data: ciclo, error } = await service
    .from("melosa_ciclos")
    .select("*")
    .eq("id", cicloId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!ciclo) throw new Error("Ciclo não encontrado");

  const row = ciclo as MelosaCicloRow & { alerta_oculto?: boolean };
  const patch: Record<string, unknown> = {};

  if (opts.alerta_oculto !== undefined) {
    patch.alerta_oculto = opts.alerta_oculto;
  }

  if (opts.capacidade_litros !== undefined) {
    const cap = opts.capacidade_litros;
    const ativo = normalizeAtivo(row.ativo_melosa_texto);

    if (cap != null && cap > 0) {
      const { error: eqErr } = await service
        .from("equipamentos")
        .update({ capacidade_litros: cap })
        .eq("tipo", "MELOSA")
        .ilike("ativo", ativo);
      if (eqErr) throw new Error(eqErr.message);
    }

    const metricas = await enriquecerCiclosParaListagem(service, [row]);
    const m = metricas.get(row.id);
    const litrosSobraAnterior = m?.litros_sobra_anterior ?? toNum(row.litros_sobra_anterior);
    const litrosRetirada = toNum(row.litros_retirada);
    const capacidadeEff = cap != null && cap > 0 ? cap : null;
    const { volumeExcedente, status } = avaliarEnchimentoMelosa(
      litrosSobraAnterior,
      litrosRetirada,
      capacidadeEff,
    );

    patch.capacidade_litros = capacidadeEff;
    patch.volume_excedente = volumeExcedente;
    patch.status = status;
    patch.alerta_oculto = false;
  }

  if (Object.keys(patch).length === 0) {
    throw new Error("Nenhuma alteração informada.");
  }

  const { data: updated, error: updErr } = await service
    .from("melosa_ciclos")
    .update(patch)
    .eq("id", cicloId)
    .select("*")
    .single();

  if (updErr) throw new Error(updErr.message);
  return updated as MelosaCicloRow & { alerta_oculto: boolean };
}
