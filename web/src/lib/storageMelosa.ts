import { supabase } from "./supabase";

const COMPROVANTE_BUCKETS = ["melosa_comprovantes"];
const TANQUE_BUCKETS = ["melosa_tanques"];
const SIGNED_URL_TTL = 3600;

async function getSignedUrl(bucket: string, storagePath: string): Promise<string | null> {
  const path = storagePath.trim();
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL);
  if (error) {
    console.warn(`[storage ${bucket}]`, error.message);
    return null;
  }
  return data.signedUrl;
}

export async function getMelosaComprovanteSignedUrl(storagePath: string): Promise<string | null> {
  for (const bucket of COMPROVANTE_BUCKETS) {
    const signed = await getSignedUrl(bucket, storagePath);
    if (signed) return signed;
  }
  return null;
}

export async function getMelosaTanqueSignedUrl(storagePath: string): Promise<string | null> {
  for (const bucket of TANQUE_BUCKETS) {
    const signed = await getSignedUrl(bucket, storagePath);
    if (signed) return signed;
  }
  return null;
}

