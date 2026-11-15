import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { collectTopic } from "@/lib/collect";
import { pickTopic } from "@/lib/pick-topic";

export async function runDaily(
  admin: SupabaseClient,
  onlySlug?: string,
): Promise<{ slug: string; added: number; sources: number; pickDate?: string; youtubeId?: string; whyLine?: string; gap?: string; skipped?: string; error?: string }[]> {
  const full = await admin.from("topics").select("id, slug, source_config").eq("status", "live");
  const topicsResult = full.error?.message.includes("source_config")
    ? await admin.from("topics").select("id, slug").eq("status", "live")
    : full;
  let queryTopics = topicsResult.data;
  if (onlySlug) queryTopics = (queryTopics ?? []).filter((topic) => topic.slug === onlySlug);
  if (topicsResult.error && !topicsResult.error.message.includes("source_config")) {
    throw new Error(topicsResult.error.message);
  }

  const results = [];
  for (const topic of queryTopics ?? []) {
    const collected = await collectTopic(admin, topic);
    const picked = collected.error ? { gap: collected.error } : await pickTopic(admin, topic);
    results.push({ slug: topic.slug as string, ...collected, ...picked });
  }
  return results;
}
