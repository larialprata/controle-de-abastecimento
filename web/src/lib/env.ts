export const env = {
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  VITE_API_URL: import.meta.env.VITE_API_URL as string | undefined,
};

export function requireEnv(key: keyof typeof env) {
  const value = env[key];
  if (!value) throw new Error(`Missing env var: ${String(key)}`);
  return value;
}

