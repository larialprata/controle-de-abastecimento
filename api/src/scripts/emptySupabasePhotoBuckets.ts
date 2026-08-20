/**
 * Esvazia buckets de foto no Supabase Storage (após migração para SharePoint).
 *
 *   npx ts-node --transpile-only src/scripts/emptySupabasePhotoBuckets.ts --dry-run
 *   npx ts-node --transpile-only src/scripts/emptySupabasePhotoBuckets.ts --apply
 */
import "dotenv/config";
import { createSupabaseServiceRole } from "../lib/supabase";
import { envValidated } from "../config";

const APPLY = process.argv.includes("--apply");

const BUCKETS = [
  envValidated.CNH_BUCKET,
  envValidated.NOTAS_BUCKET,
  envValidated.LACRE_TANQUE_BUCKET,
  envValidated.LACRE_MELOSA_BUCKET,
  envValidated.MEDIDOR_TANQUE_BUCKET,
  envValidated.CONFIRMACAO_ABASTECIMENTO_BUCKET,
  envValidated.RETIRADA_HORIMETRO_BUCKET,
  envValidated.FOTO_QUANTIDADE_ABASTECIDA_BUCKET,
  envValidated.MELOSA_HORIMETRO_EQUIPAMENTO_ABASTECIDO_BUCKET,
  envValidated.MELOSA_EQUIPAMENTO_OPERADOR_BUCKET,
  envValidated.MELOSA_LACRE_BUCKET,
  envValidated.MELOSA_ASSINATURAS_BUCKET,
  "melosa_comprovantes",
  "melosa_tanques",
  "melosa_tanque",
  "melosa_medidor_acumulado",
];

async function listAllPaths(bucket: string, prefix = ""): Promise<string[]> {
  const service = createSupabaseServiceRole();
  const paths: string[] = [];
  const { data, error } = await service.storage.from(bucket).list(prefix, {
    limit: 1000,
    offset: 0,
  });
  if (error) {
    console.warn(`[${bucket}] list ${prefix || "/"}:`, error.message);
    return paths;
  }
  for (const item of data ?? []) {
    const full = prefix ? `${prefix}/${item.name}` : item.name;
    // pasta: id null e sem metadata.size tipicamente; ou tem "folder" em metadata
    const isFolder = item.id === null || (item.metadata == null && !item.metadata);
    // Heurística do Supabase: pastas não têm metadata.size
    const looksLikeFolder = !item.metadata || (item.metadata as { size?: number }).size == null;
    if (looksLikeFolder && item.name && !item.name.includes(".")) {
      // pode ser pasta — lista recursivo; se for arquivo sem extensão, remove também
      const nested = await listAllPaths(bucket, full);
      if (nested.length > 0) {
        paths.push(...nested);
      } else {
        // tenta como arquivo mesmo assim
        paths.push(full);
      }
    } else {
      paths.push(full);
    }
  }
  return paths;
}

async function emptyBucket(bucket: string) {
  const service = createSupabaseServiceRole();
  console.log(`\n=== bucket ${bucket} ===`);

  // BFS listagem
  const queue: string[] = [""];
  const files: string[] = [];
  const seen = new Set<string>();

  while (queue.length) {
    const prefix = queue.shift()!;
    const key = prefix || "/";
    if (seen.has(key)) continue;
    seen.add(key);

    const { data, error } = await service.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error) {
      console.warn("  list error:", error.message);
      continue;
    }
    for (const item of data ?? []) {
      const full = prefix ? `${prefix}/${item.name}` : item.name;
      const size = (item.metadata as { size?: number } | null)?.size;
      if (size == null && item.id == null) {
        queue.push(full);
      } else if (size == null) {
        // possível pasta com id
        queue.push(full);
      } else {
        files.push(full);
      }
    }
  }

  console.log(`  arquivos: ${files.length}`);
  if (!APPLY) return { bucket, files: files.length, removed: 0 };

  let removed = 0;
  const chunk = 100;
  for (let i = 0; i < files.length; i += chunk) {
    const batch = files.slice(i, i + chunk);
    const { error } = await service.storage.from(bucket).remove(batch);
    if (error) {
      console.error("  remove error:", error.message);
    } else {
      removed += batch.length;
      console.log(`  removidos ${removed}/${files.length}`);
    }
  }
  return { bucket, files: files.length, removed };
}

async function main() {
  console.log(`[empty-supabase] mode=${APPLY ? "APPLY" : "dry-run"}`);
  const unique = [...new Set(BUCKETS.filter(Boolean))];
  const results = [];
  for (const b of unique) {
    results.push(await emptyBucket(b));
  }
  console.log("\nresumo:", results);
  if (!APPLY) console.log("Rode com --apply para apagar os arquivos dos buckets.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
