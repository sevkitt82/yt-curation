import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { fetchVideosList, metadataRow } from "../lib/youtube";

type Candidate = {
  topic_slug: string;
  youtube_id: string;
  sources: {
    platform: "reddit" | "hacker_news" | "x" | "forum" | "curator" | "other";
    source_url: string;
    quote_or_summary: string;
    recommended_at: string;
  }[];
};

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

async function main() {
  loadEnvFile(".env.local");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY before running the seed.");
  }
  if (!process.env.YOUTUBE_API_KEY) {
    throw new Error("Set YOUTUBE_API_KEY. The seed calls videos.list and logs quota.");
  }

  const candidates = JSON.parse(readFileSync("data/candidates.json", "utf8")) as Candidate[];
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: topics, error: topicError } = await admin.from("topics").select("id, slug");
  if (topicError) throw new Error(topicError.message);
  const topicBySlug = new Map((topics ?? []).map((topic) => [topic.slug as string, topic.id as string]));

  const metadata = await fetchVideosList(candidates.map((candidate) => candidate.youtube_id));
  let inserted = 0;

  for (const candidate of candidates) {
    const topicId = topicBySlug.get(candidate.topic_slug);
    if (!topicId) throw new Error(`Unknown topic slug ${candidate.topic_slug}`);
    const meta = metadata.get(candidate.youtube_id);
    const row = meta
      ? metadataRow(meta)
      : {
          youtube_video_id: candidate.youtube_id,
          is_unavailable: true,
          youtube_data_fetched_at: new Date().toISOString(),
        };

    const { data: video, error: videoError } = await admin
      .from("videos")
      .upsert(row, { onConflict: "youtube_video_id" })
      .select("id")
      .single();
    if (videoError || !video) throw new Error(videoError?.message ?? "video upsert failed");

    const { data: existing } = await admin
      .from("topic_videos")
      .select("id, status")
      .eq("topic_id", topicId)
      .eq("video_id", video.id)
      .maybeSingle();

    if (!existing) {
      const { error } = await admin.from("topic_videos").insert({
        topic_id: topicId,
        video_id: video.id,
        status: "candidate",
        length_bucket: meta?.lengthBucket ?? null,
      });
      if (error) throw new Error(error.message);
      inserted += 1;
    }

    for (const source of candidate.sources) {
      const { data: already } = await admin
        .from("recommendation_sources")
        .select("id")
        .eq("topic_id", topicId)
        .eq("video_id", video.id)
        .eq("source_url", source.source_url)
        .maybeSingle();
      if (already) continue;
      const { error } = await admin.from("recommendation_sources").insert({
        video_id: video.id,
        topic_id: topicId,
        platform: source.platform,
        source_url: source.source_url,
        quote_or_summary: source.quote_or_summary,
        recommended_at: source.recommended_at,
      });
      if (error) throw new Error(error.message);
    }

    if (!meta) console.warn(`No videos.list item for ${candidate.youtube_id}; saved as unavailable.`);
  }

  console.log(`Seed finished. New topic links: ${inserted}. Candidates stay unapproved.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
