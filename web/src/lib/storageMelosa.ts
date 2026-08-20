/**
 * @deprecated Acesso direto ao Supabase Storage descontinuado.
 * Use os endpoints da API: GET /v1/melosa/photo-url ou /v1/melosa/photo-data
 */
export async function getMelosaComprovanteSignedUrl(_storagePath: string): Promise<string | null> {
  console.warn(
    "[storageMelosa] descontinuado — use GET /v1/melosa/photo-url via API autenticada",
  );
  return null;
}

/**
 * @deprecated Acesso direto ao Supabase Storage descontinuado.
 * Use os endpoints da API: GET /v1/melosa/photo-url ou /v1/melosa/photo-data
 */
export async function getMelosaTanqueSignedUrl(_storagePath: string): Promise<string | null> {
  console.warn(
    "[storageMelosa] descontinuado — use GET /v1/melosa/photo-url via API autenticada",
  );
  return null;
}
