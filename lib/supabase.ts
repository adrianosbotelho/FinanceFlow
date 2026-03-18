import "server-only";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServerKey = supabaseServiceRoleKey ?? supabaseAnonKey;

if (!supabaseUrl || !supabaseServerKey) {
  console.warn(
    "[FinanceFlow] Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (fallback: NEXT_PUBLIC_SUPABASE_ANON_KEY).",
  );
}

if (!supabaseServiceRoleKey) {
  console.warn(
    "[FinanceFlow] SUPABASE_SERVICE_ROLE_KEY not set. Using NEXT_PUBLIC_SUPABASE_ANON_KEY as fallback, which is not recommended for production security hardening.",
  );
}

export const supabase = createClient(supabaseUrl ?? "", supabaseServerKey ?? "", {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
