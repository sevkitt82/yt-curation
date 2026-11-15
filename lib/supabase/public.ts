import "server-only";

import { createClient } from "@supabase/supabase-js";

export function publicEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

/** Publishable key, no session. Used for public reads and anonymous inserts. RLS applies. */
export function createPublicClient() {
  const env = publicEnv();
  if (!env) return null;
  return createClient(env.url, env.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
