export const env = {
  SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL as string | undefined,
  SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string | undefined,
  API_URL: process.env.EXPO_PUBLIC_API_URL as string | undefined,
};

export function requireEnv(key: keyof typeof env) {
  const value = env[key];
  if (!value) throw new Error(`Missing env var: ${String(key)}`);
  return value;
}

