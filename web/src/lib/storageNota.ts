/**
 * @deprecated Acesso direto ao Supabase Storage descontinuado.
 * Use os endpoints da API: GET /v1/tanque/photo-url
 */
export async function getNotaSignedUrl(_storagePath: string): Promise<string | null> {
  console.warn(
    "[storageNota] descontinuado — use GET /v1/tanque/photo-url via API autenticada",
  );
  return null;
}
