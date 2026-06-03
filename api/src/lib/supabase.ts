import { createClient } from "@supabase/supabase-js";
import { envValidated } from "../config";

export function createSupabaseServiceRole() {
  return createClient(envValidated.SUPABASE_URL, envValidated.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createSupabaseAnonWithToken(accessToken: string) {
  return createClient(envValidated.SUPABASE_URL, envValidated.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

