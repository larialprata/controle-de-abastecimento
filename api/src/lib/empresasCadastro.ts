import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEquipamentoEmpresa } from "./equipamentoEmpresa";

export type EmpresaCadastroRow = {
  id: string;
  nome: string;
  ativo: boolean;
};

export async function findEmpresaCadastrada(
  service: SupabaseClient,
  nomeRaw: string | null | undefined,
): Promise<EmpresaCadastroRow | null> {
  const nome = normalizeEquipamentoEmpresa(nomeRaw);
  if (!nome) return null;

  const { data, error } = await service.from("empresas").select("id, nome, ativo").ilike("nome", nome);
  if (error) throw error;

  return (
    (data ?? []).find(
      (row) =>
        (normalizeEquipamentoEmpresa(row.nome) ?? "").toLowerCase() === nome.toLowerCase(),
    ) ?? null
  );
}

export async function assertEmpresaCadastradaAtiva(
  service: SupabaseClient,
  nomeRaw: string | null | undefined,
): Promise<{ ok: true; nome: string | null } | { ok: false; error: string }> {
  const nome = normalizeEquipamentoEmpresa(nomeRaw);
  if (!nome) return { ok: true, nome: null };

  const found = await findEmpresaCadastrada(service, nome);
  if (!found) {
    return {
      ok: false,
      error: `Empresa "${nome}" não está cadastrada. Cadastre-a em Gerenciar empresas antes de usar.`,
    };
  }
  if (!found.ativo) {
    return {
      ok: false,
      error: `Empresa "${found.nome}" está inativa. Ative-a em Gerenciar empresas antes de usar.`,
    };
  }

  return { ok: true, nome: normalizeEquipamentoEmpresa(found.nome) };
}
