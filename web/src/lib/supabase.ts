import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "./env";

const SUPABASE_URL = requireEnv("VITE_SUPABASE_URL");
const SUPABASE_ANON_KEY = requireEnv("VITE_SUPABASE_ANON_KEY");

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: "pkce",
    detectSessionInUrl: true,
    persistSession: true,
  },
});

