import { lookupEquipamentoByAtivo } from "./equipamentoQrLookup";
import { expandAtivoSearchNeedles, normalizeAtivoPlacaExterno } from "./equipamentosExternos";
import { createSupabaseServiceRole } from "./supabase";

export type AbastEquipamentoCadastro = {
  ativo: string;
  nome: string | null;
  empresa: string | null;
  placa: string | null;
};

function placaColumnMissing(message: string): boolean {
  return message.includes("placa") && message.includes("does not exist");
}

export async function loadAbastEquipamentoByAtivo(
  ativoOuPlaca: string,
  obraCodigo?: number | null,
): Promise<AbastEquipamentoCadastro | null> {
  const service = createSupabaseServiceRole();
  const norm = normalizeAtivoPlacaExterno(ativoOuPlaca);
  if (!norm) return null;

  const searchNeedles = expandAtivoSearchNeedles(ativoOuPlaca);

  function mapRow(row: {
    ativo: string;
    nome: string | null;
    empresa: string | null;
    placa?: string | null;
  }): AbastEquipamentoCadastro {
    return {
      ativo: row.ativo,
      nome: row.nome,
      empresa: row.empresa,
      placa: row.placa?.trim() ? normalizeAtivoPlacaExterno(row.placa) : null,
    };
  }

  function matchesAtivoOrPlaca(row: { ativo: string; placa?: string | null }): boolean {
    if (normalizeAtivoPlacaExterno(row.ativo) === norm) return true;
    if (row.placa && normalizeAtivoPlacaExterno(row.placa) === norm) return true;
    return false;
  }

  async function findInScope(scopeObra?: number | null) {
    for (const needle of searchNeedles) {
      let byAtivo = service
        .from("equipamentos")
        .select("ativo, nome, empresa, placa")
        .eq("tipo", "EQUIPAMENTO")
        .ilike("ativo", needle);
      if (scopeObra != null && scopeObra > 0) {
        byAtivo = byAtivo.eq("obra_codigo", scopeObra);
      }
      const { data: ativoRows, error: ativoErr } = await byAtivo.limit(8);
      if (ativoErr) {
        if (placaColumnMissing(ativoErr.message)) {
          throw new Error(
            "Banco desatualizado: execute migration_equipamento_placa.sql no SQL Editor do Supabase.",
          );
        }
        throw ativoErr;
      }
      const ativoMatch = (ativoRows ?? []).find((row) => matchesAtivoOrPlaca(row));
      if (ativoMatch) return mapRow(ativoMatch);

      let byPlaca = service
        .from("equipamentos")
        .select("ativo, nome, empresa, placa")
        .eq("tipo", "EQUIPAMENTO")
        .ilike("placa", needle);
      if (scopeObra != null && scopeObra > 0) {
        byPlaca = byPlaca.eq("obra_codigo", scopeObra);
      }
      const { data: placaRows, error: placaErr } = await byPlaca.limit(8);
      if (placaErr) {
        if (placaColumnMissing(placaErr.message)) {
          throw new Error(
            "Banco desatualizado: execute migration_equipamento_placa.sql no SQL Editor do Supabase.",
          );
        }
        throw placaErr;
      }
      const placaMatch = (placaRows ?? []).find((row) => matchesAtivoOrPlaca(row));
      if (placaMatch) return mapRow(placaMatch);
    }

    let fallbackQuery = service
      .from("equipamentos")
      .select("ativo, nome, empresa, placa")
      .eq("tipo", "EQUIPAMENTO");
    if (scopeObra != null && scopeObra > 0) {
      fallbackQuery = fallbackQuery.eq("obra_codigo", scopeObra);
    }
    const { data: rows, error: fallbackError } = await fallbackQuery;
    if (fallbackError) {
      if (placaColumnMissing(fallbackError.message)) {
        throw new Error(
          "Banco desatualizado: execute migration_equipamento_placa.sql no SQL Editor do Supabase.",
        );
      }
      throw fallbackError;
    }
    const fallbackMatch = (rows ?? []).find((row) => matchesAtivoOrPlaca(row));
    if (!fallbackMatch) return null;
    return mapRow(fallbackMatch);
  }

  if (obraCodigo != null && obraCodigo > 0) {
    const scoped = await findInScope(obraCodigo);
    if (scoped) return scoped;
  }

  return findInScope(null);
}

/** Cadastro local + Controle de Equipamentos (empresa, nome, placa). */
export async function resolveEquipamentoCadastro(ativoOuPlaca: string, obraCodigo?: number | null) {
  return lookupEquipamentoByAtivo(ativoOuPlaca, obraCodigo, loadAbastEquipamentoByAtivo);
}
