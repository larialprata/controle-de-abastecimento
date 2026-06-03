import { supabase } from "./supabase";

const BUCKET = "notas";
const SIGNED_URL_TTL = 3600;

export async function getNotaSignedUrl(storagePath: string): Promise<string | null> {
  const path = storagePath.trim();
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
  if (error) {
    console.warn("[storage notas]", error.message);
    return null;
  }
  return data.signedUrl;
}
