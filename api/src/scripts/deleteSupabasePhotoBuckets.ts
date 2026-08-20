/**
 * Remove buckets de foto do Supabase Storage (já migrados para SharePoint).
 *
 *   npx ts-node --transpile-only src/scripts/deleteSupabasePhotoBuckets.ts --apply
 */
import "dotenv/config";
import { createSupabaseServiceRole } from "../lib/supabase";

const APPLY = process.argv.includes("--apply");

const PHOTO_BUCKET_NAMES = new Set([
  "cnh",
  "notas",
  "lacre_tanque",
  "lacre_melosa",
  "medidor_tanque",
  "confirmacao_abastecimento",
  "retirada_horimetro",
  "foto_quantidade_abastecida",
  "Foto Quantidade Abastecida",
  "melosa_horimetro_equipamento_abastecido",
  "melosa_equipamento_operador",
  "melosa_lacre",
  "melosa_assinaturas",
  "melosa_comprovantes",
  "melosa_tanques",
  "melosa_tanque",
  "melosa_medidor_acumulado",
]);

async function wipePrefix(bucket: string, prefix = ""): Promise<number> {
  const service = createSupabaseServiceRole();
  let removed = 0;
  const queue = [prefix];
  const seen = new Set<string>();

  while (queue.length) {
    const p = queue.shift()!;
    if (seen.has(p)) continue;
    seen.add(p);

    const { data, error } = await service.storage.from(bucket).list(p || undefined, { limit: 1000 });
    if (error) {
      console.warn(`  list ${bucket}/${p}:`, error.message);
      continue;
    }

    const files: string[] = [];
    for (const item of data ?? []) {
      const full = p ? `${p}/${item.name}` : item.name;
      const size = (item.metadata as { size?: number } | null)?.size;
      if (size == null) {
        queue.push(full);
      } else {
        files.push(full);
      }
    }

    if (files.length) {
      const { error: remErr } = await service.storage.from(bucket).remove(files);
      if (remErr) console.error(`  remove error:`, remErr.message);
      else removed += files.length;
    }
  }
  return removed;
}

async function main() {
  const service = createSupabaseServiceRole();
  const { data: buckets, error } = await service.storage.listBuckets();
  if (error) throw error;

  const targets = (buckets ?? []).filter((b) => PHOTO_BUCKET_NAMES.has(b.name));
  console.log(`[delete-buckets] mode=${APPLY ? "APPLY" : "dry-run"} targets=${targets.length}`);
  for (const b of targets) console.log(" -", b.name);

  if (!APPLY) {
    console.log("Rode com --apply para esvaziar e excluir os buckets.");
    return;
  }

  for (const b of targets) {
    const bucketKey = b.id || b.name;
    console.log(`\n=== ${b.name} (id=${bucketKey}) ===`);
    const wiped = await wipePrefix(bucketKey);
    console.log(`  arquivos removidos: ${wiped}`);

    const { error: emptyErr } = await service.storage.emptyBucket(bucketKey);
    if (emptyErr) console.warn(`  emptyBucket:`, emptyErr.message);

    const { error: delErr } = await service.storage.deleteBucket(bucketKey);
    if (delErr) {
      console.error(`  deleteBucket FAIL:`, delErr.message);
    } else {
      console.log(`  bucket excluído`);
    }
  }

  const after = await service.storage.listBuckets();
  console.log(
    "\nbuckets restantes:",
    (after.data ?? []).map((b) => b.name),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
