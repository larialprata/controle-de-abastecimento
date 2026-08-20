/**
 * Lança transferência pontual melosa → melosa via service role.
 *
 * Uso:
 *   npx ts-node --transpile-only src/scripts/registrarTransferenciaMelosa.ts
 */
import "dotenv/config";
import { createSupabaseServiceRole } from "../lib/supabase";
import {
  isTransferenciaMelosaObs,
  registrarTransferenciaMelosa,
} from "../lib/melosaTransferencia";

const OBRA = 232;
const ORIGEM = "CCL1563";
const DESTINO = "CCL1399";
const LITROS = 2290;
/** 17/08/2026 09:00 America/Sao_Paulo */
const DATA_HORA = "2026-08-17T12:00:00.000Z";

async function resolveUsuarioId(): Promise<string> {
  const service = createSupabaseServiceRole();
  const { data: admin } = await service
    .from("profiles")
    .select("user_id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  if (admin?.user_id) return String(admin.user_id);

  const { data: anyProfile } = await service.from("profiles").select("user_id").limit(1).maybeSingle();
  if (anyProfile?.user_id) return String(anyProfile.user_id);

  throw new Error("Nenhum usuário em profiles para associar a transferência.");
}

async function jaExisteTransferencia(): Promise<boolean> {
  const service = createSupabaseServiceRole();
  const { data } = await service
    .from("melosa_movimentacoes")
    .select("operation_id, data_hora, litros, ativo_melosa_texto, ativo_equipamento_texto, obs")
    .ilike("ativo_melosa_texto", ORIGEM)
    .ilike("ativo_equipamento_texto", DESTINO)
    .eq("obra_codigo", OBRA)
    .gte("data_hora", "2026-08-17T00:00:00.000Z")
    .lt("data_hora", "2026-08-18T00:00:00.000Z");

  return (data ?? []).some((row) => {
    const litros = Number(row.litros);
    return (
      isTransferenciaMelosaObs(row.obs as string | null) &&
      Number.isFinite(litros) &&
      Math.abs(litros - LITROS) < 0.01
    );
  });
}

async function main() {
  if (await jaExisteTransferencia()) {
    console.log("Transferência já registrada (idempotente). Nada a fazer.");
    return;
  }

  const usuarioId = await resolveUsuarioId();
  const service = createSupabaseServiceRole();

  const { data: melosas } = await service
    .from("equipamentos")
    .select("ativo, tipo, capacidade_litros")
    .eq("tipo", "MELOSA");

  const norm = (v: string) => v.trim().toUpperCase();
  const origemOk = (melosas ?? []).some((m) => norm(String(m.ativo ?? "")) === ORIGEM);
  const destinoOk = (melosas ?? []).some((m) => norm(String(m.ativo ?? "")) === DESTINO);
  if (!origemOk || !destinoOk) {
    console.error("Cadastro melosa:", {
      origem: ORIGEM,
      origemOk,
      destino: DESTINO,
      destinoOk,
      melosas: (melosas ?? []).map((m) => m.ativo),
    });
    throw new Error("Origem e/ou destino não cadastrados como MELOSA.");
  }

  const { data: obra } = await service.from("obras").select("codigo, nome").eq("codigo", OBRA).maybeSingle();
  if (!obra) throw new Error(`Obra/contrato ${OBRA} não encontrada.`);

  const result = await registrarTransferenciaMelosa(service, {
    usuarioId,
    obraCodigo: OBRA,
    dataHora: DATA_HORA,
    ativoOrigem: ORIGEM,
    ativoDestino: DESTINO,
    litros: LITROS,
    combustivelTipo: "DIESEL_S10",
    obs: "Registro operacional: CCL1563 esvaziou e encheu CCL1399",
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        obra: OBRA,
        origem: ORIGEM,
        destino: DESTINO,
        litros: LITROS,
        data_hora: DATA_HORA,
        saida_operation_id: result.saida_operation_id,
        entrada_operation_id: result.entrada_operation_id,
        ciclo_numero: result.ciclo.ciclo_numero,
        ciclo_id: result.ciclo.id,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
