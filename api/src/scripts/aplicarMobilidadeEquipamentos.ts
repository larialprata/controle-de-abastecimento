import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { inferMobilidadeFromNome } from "../lib/equipamentoMobilidade";

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY obrigatórios.");

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("equipamentos")
    .select("ativo, nome")
    .eq("tipo", "EQUIPAMENTO");
  if (error) throw error;

  let estacionario = 0;
  let movel = 0;

  for (const row of data ?? []) {
    const mobilidade = inferMobilidadeFromNome(row.nome);
    if (mobilidade === "ESTACIONARIO") estacionario += 1;
    else movel += 1;

    const { error: updErr } = await supabase
      .from("equipamentos")
      .update({ mobilidade })
      .eq("ativo", row.ativo);
    if (updErr) throw updErr;
  }

  console.log(`Atualizados ${data?.length ?? 0} equipamentos`);
  console.log(`Estacionário (geradores): ${estacionario}`);
  console.log(`Móvel: ${movel}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
