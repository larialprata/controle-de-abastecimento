/**
 * Migra fotos do Supabase Storage → SharePoint, organizadas por mês:
 *   {YYYY-MM}/{ATIVO}-{YYYY-MM-DD}-{abertura|fechamento|abastecimento}-{kind}-{op8}.{ext}
 *
 * Uso:
 *   npx ts-node --transpile-only src/scripts/migratePhotosToSharePoint.ts --dry-run
 *   npx ts-node --transpile-only src/scripts/migratePhotosToSharePoint.ts --apply
 *
 * Flags:
 *   --dry-run   só lista (default)
 *   --apply     copia + atualiza Postgres
 *   --limit=N   processa no máximo N arquivos
 */
import "dotenv/config";
import { createSupabaseServiceRole } from "../lib/supabase";
import { createSharePointObjectStorage } from "../lib/storage/sharepointStorage";
import { createSupabaseObjectStorage } from "../lib/storage/supabaseStorage";
import {
  buildMonthOrganizedStoragePath,
  extFromPathOrContentType,
  isMonthOrganizedStoragePath,
} from "../lib/storage/photoNaming";
import { envValidated } from "../config";

type PhotoJob = {
  table: "movimentacoes" | "melosa_movimentacoes" | "profiles";
  idColumn: "operation_id" | "user_id";
  id: string;
  column: string;
  bucket: string;
  oldPath: string;
  ativo: string | null;
  dataHora: string | null;
  tipo: string | null;
  kind: string;
};

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const DRY_RUN = !APPLY;
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : undefined;

function mimeFromExt(ext: string): string {
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

async function fetchAllRows<T extends Record<string, unknown>>(
  table: string,
  select: string,
): Promise<T[]> {
  const service = createSupabaseServiceRole();
  const pageSize = 1000;
  let from = 0;
  const all: T[] = [];
  for (;;) {
    const { data, error } = await service.from(table).select(select).range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = (data ?? []) as unknown as T[];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

function pushIfPath(
  jobs: PhotoJob[],
  base: Omit<PhotoJob, "column" | "bucket" | "oldPath" | "kind">,
  column: string,
  bucket: string,
  kind: string,
  path: unknown,
) {
  const oldPath = typeof path === "string" ? path.trim() : "";
  if (!oldPath) return;
  if (isMonthOrganizedStoragePath(oldPath)) return; // já migrado
  jobs.push({ ...base, column, bucket, oldPath, kind });
}

async function collectJobs(): Promise<PhotoJob[]> {
  const jobs: PhotoJob[] = [];

  const tanqueRows = await fetchAllRows<{
    operation_id: string;
    tipo: string | null;
    data_hora: string | null;
    placa_texto: string | null;
    tanque_numero: number | null;
    nota_storage_path: string | null;
    lacre_tanque_storage_path: string | null;
    lacre_melosa_storage_path: string | null;
    tanque_quantidade_abastecida_storage_path: string | null;
    tanque_assinatura_operador_storage_path: string | null;
    tanque_assinatura_melosa_storage_path: string | null;
    retirada_horimetro_foto_storage_path: string | null;
  }>(
    "movimentacoes",
    "operation_id, tipo, data_hora, placa_texto, tanque_numero, nota_storage_path, lacre_tanque_storage_path, lacre_melosa_storage_path, tanque_quantidade_abastecida_storage_path, tanque_assinatura_operador_storage_path, tanque_assinatura_melosa_storage_path, retirada_horimetro_foto_storage_path",
  );

  for (const row of tanqueRows) {
    const ativo =
      String(row.placa_texto ?? "").trim() ||
      (row.tanque_numero != null ? `TANQUE-${row.tanque_numero}` : null);
    const base = {
      table: "movimentacoes" as const,
      idColumn: "operation_id" as const,
      id: row.operation_id,
      ativo,
      dataHora: row.data_hora,
      tipo: row.tipo,
    };
    pushIfPath(jobs, base, "nota_storage_path", envValidated.NOTAS_BUCKET, "nota", row.nota_storage_path);
    pushIfPath(
      jobs,
      base,
      "lacre_tanque_storage_path",
      envValidated.LACRE_TANQUE_BUCKET,
      "lacre-tanque",
      row.lacre_tanque_storage_path,
    );
    pushIfPath(
      jobs,
      base,
      "lacre_melosa_storage_path",
      envValidated.LACRE_MELOSA_BUCKET,
      "lacre-melosa",
      row.lacre_melosa_storage_path,
    );
    pushIfPath(
      jobs,
      base,
      "tanque_quantidade_abastecida_storage_path",
      envValidated.FOTO_QUANTIDADE_ABASTECIDA_BUCKET,
      "quantidade",
      row.tanque_quantidade_abastecida_storage_path,
    );
    pushIfPath(
      jobs,
      base,
      "tanque_assinatura_operador_storage_path",
      envValidated.MELOSA_ASSINATURAS_BUCKET,
      "assinatura-operador",
      row.tanque_assinatura_operador_storage_path,
    );
    pushIfPath(
      jobs,
      base,
      "tanque_assinatura_melosa_storage_path",
      envValidated.MELOSA_ASSINATURAS_BUCKET,
      "assinatura-melosa",
      row.tanque_assinatura_melosa_storage_path,
    );
    pushIfPath(
      jobs,
      base,
      "retirada_horimetro_foto_storage_path",
      envValidated.RETIRADA_HORIMETRO_BUCKET,
      "horimetro",
      row.retirada_horimetro_foto_storage_path,
    );
  }

  const melosaRows = await fetchAllRows<{
    operation_id: string;
    data_hora: string | null;
    ativo_melosa_texto: string | null;
    melosa_quantidade_abastecida_storage_path: string | null;
    melosa_horimetro_equipamento_abastecido_storage_path: string | null;
    melosa_equipamento_operador_storage_path: string | null;
    melosa_assinatura_operador_storage_path: string | null;
    melosa_assinatura_motorista_storage_path: string | null;
    melosa_comprovante_storage_path: string | null;
    melosa_lacre_storage_path: string | null;
    melosa_tanque_storage_path: string | null;
  }>(
    "melosa_movimentacoes",
    "operation_id, data_hora, ativo_melosa_texto, melosa_quantidade_abastecida_storage_path, melosa_horimetro_equipamento_abastecido_storage_path, melosa_equipamento_operador_storage_path, melosa_assinatura_operador_storage_path, melosa_assinatura_motorista_storage_path, melosa_comprovante_storage_path, melosa_lacre_storage_path, melosa_tanque_storage_path",
  );

  for (const row of melosaRows) {
    const ativo = String(row.ativo_melosa_texto ?? "").trim() || null;
    const base = {
      table: "melosa_movimentacoes" as const,
      idColumn: "operation_id" as const,
      id: row.operation_id,
      ativo,
      dataHora: row.data_hora,
      tipo: "RETIRADA_MELOSA",
    };
    pushIfPath(
      jobs,
      base,
      "melosa_quantidade_abastecida_storage_path",
      envValidated.FOTO_QUANTIDADE_ABASTECIDA_BUCKET,
      "quantidade",
      row.melosa_quantidade_abastecida_storage_path,
    );
    pushIfPath(
      jobs,
      base,
      "melosa_horimetro_equipamento_abastecido_storage_path",
      envValidated.MELOSA_HORIMETRO_EQUIPAMENTO_ABASTECIDO_BUCKET,
      "horimetro",
      row.melosa_horimetro_equipamento_abastecido_storage_path,
    );
    pushIfPath(
      jobs,
      base,
      "melosa_equipamento_operador_storage_path",
      envValidated.MELOSA_EQUIPAMENTO_OPERADOR_BUCKET,
      "equipamento-operador",
      row.melosa_equipamento_operador_storage_path,
    );
    pushIfPath(
      jobs,
      base,
      "melosa_assinatura_operador_storage_path",
      envValidated.MELOSA_ASSINATURAS_BUCKET,
      "assinatura-operador",
      row.melosa_assinatura_operador_storage_path,
    );
    pushIfPath(
      jobs,
      base,
      "melosa_assinatura_motorista_storage_path",
      envValidated.MELOSA_ASSINATURAS_BUCKET,
      "assinatura-motorista",
      row.melosa_assinatura_motorista_storage_path,
    );
    pushIfPath(
      jobs,
      base,
      "melosa_comprovante_storage_path",
      "melosa_comprovantes",
      "comprovante",
      row.melosa_comprovante_storage_path,
    );
    pushIfPath(jobs, base, "melosa_lacre_storage_path", envValidated.MELOSA_LACRE_BUCKET, "lacre", row.melosa_lacre_storage_path);
    pushIfPath(jobs, base, "melosa_tanque_storage_path", "melosa_tanques", "tanque", row.melosa_tanque_storage_path);
  }

  const profiles = await fetchAllRows<{
    user_id: string;
    full_name: string | null;
    cnh_storage_path: string | null;
    updated_at: string | null;
    created_at: string | null;
  }>("profiles", "user_id, full_name, cnh_storage_path, updated_at, created_at");

  for (const row of profiles) {
    const oldPath = typeof row.cnh_storage_path === "string" ? row.cnh_storage_path.trim() : "";
    if (!oldPath || isMonthOrganizedStoragePath(oldPath)) continue;
    jobs.push({
      table: "profiles",
      idColumn: "user_id",
      id: row.user_id,
      column: "cnh_storage_path",
      bucket: envValidated.CNH_BUCKET,
      oldPath,
      ativo: row.full_name,
      dataHora: row.updated_at ?? row.created_at,
      tipo: "CNH",
      kind: "cnh",
    });
  }

  return jobs;
}

async function main() {
  if (envValidated.STORAGE_PROVIDER !== "sharepoint") {
    throw new Error("STORAGE_PROVIDER deve ser sharepoint para esta migração.");
  }

  console.log(`[migrate-photos] mode=${DRY_RUN ? "dry-run" : "APPLY"} limit=${LIMIT ?? "∞"}`);

  let jobs = await collectJobs();
  console.log(`[migrate-photos] jobs encontrados: ${jobs.length}`);
  if (LIMIT != null && Number.isFinite(LIMIT)) {
    jobs = jobs.slice(0, LIMIT);
    console.log(`[migrate-photos] limitados a: ${jobs.length}`);
  }

  const supabaseStorage = createSupabaseObjectStorage();
  const sharepointStorage = createSharePointObjectStorage();
  const service = createSupabaseServiceRole();

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  const concurrencyArg = args.find((a) => a.startsWith("--concurrency="));
  const CONCURRENCY = Math.max(1, Number(concurrencyArg?.split("=")[1] ?? 6));

  async function processJob(job: PhotoJob): Promise<void> {
    const ext = extFromPathOrContentType(job.oldPath);
    const finalPath = buildMonthOrganizedStoragePath({
      ativo: job.ativo,
      dataHora: job.dataHora,
      obra: job.tipo === "CNH" ? "CNH" : "migracao",
      kind: job.kind,
      ext,
      uniqueSuffix: job.id,
    });

    console.log(
      `${DRY_RUN ? "[dry]" : "[go]"} ${job.bucket} | ${job.oldPath} -> ${finalPath} (${job.table}.${job.column})`,
    );

    if (DRY_RUN) {
      skipped += 1;
      return;
    }

    try {
      const bytes = await supabaseStorage.download(job.bucket, job.oldPath);
      await sharepointStorage.upload(job.bucket, finalPath, bytes, {
        contentType: mimeFromExt(ext),
        upsert: true,
      });

      const { error: updErr } = await service
        .from(job.table)
        .update({ [job.column]: finalPath })
        .eq(job.idColumn, job.id);
      if (updErr) throw new Error(updErr.message);

      ok += 1;
      if (ok % 25 === 0) console.log(`[migrate-photos] progresso ok=${ok} failed=${failed}`);
    } catch (e: unknown) {
      failed += 1;
      console.error(`  FAIL ${job.oldPath}:`, e instanceof Error ? e.message : e);
    }
  }

  console.log(`[migrate-photos] concurrency=${CONCURRENCY}`);
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const i = next++;
      await processJob(jobs[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, () => worker()));

  console.log(`[migrate-photos] done ok=${ok} dryOrSkip=${skipped} failed=${failed}`);
  if (DRY_RUN) {
    console.log("Rode com --apply para copiar e atualizar os paths no banco.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
