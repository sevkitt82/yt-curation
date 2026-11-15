import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { collectTopic } from "@/lib/collect";
import { pickTopic } from "@/lib/pick-topic";

export async function runDaily(
  admin: SupabaseClient,
  onlySlug?: string,
): Promise<{ slug: string; added: number; sources: number; pickDate?: string; gap?: string; skipped?: string; error?: string }[]> {
  let query = admin.from("topics").select("id, slug, source_config").eq("status", "live");
  if (onlySlug) query = query.eq("slug", onlySlug);
  const { data: topics, error } = await query;
  if (error) throw new Error(error.message);

  const results = [];
  for (const topic of topics ?? []) {
    const collected = await collectTopic(admin, topic);
    const picked = collected.error ? { gap: collected.error } : await pickTopic(admin, topic);
    results.push({ slug: topic.slug as string, ...collected, ...picked });
  }
  return results;
}
