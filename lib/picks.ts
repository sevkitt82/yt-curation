import "server-only";

import { connection } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { laToday, youtubeDataIsFresh } from "@/lib/time";
import type { LengthBucket, Level, PublicPick, SourceRow, Topic, VideoRow } from "@/lib/types";

type Joined = {
  id: string;
  why_line: string | null;
  pick_date: string | null;
  pick_slot: number | null;
  level: Level | null;
  length_bucket: LengthBucket | null;
  videos: VideoRow | VideoRow[] | null;
};

function oneVideo(value: VideoRow | VideoRow[] | null): VideoRow | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export function videoIsPublic(video: VideoRow): boolean {
  return (
    video.is_unavailable === false &&
    video.embeddable === true &&
    video.privacy_status === "public" &&
    youtubeDataIsFresh(video.youtube_data_fetched_at)
  );
}

export async function listLiveTopics(): Promise<Topic[]> {
  await connection();
  const db = createPublicClient();
  if (!db) return [];
  const { data, error } = await db
    .from("topics")
    .select("id, slug, name, description, status, created_at")
    .eq("status", "live")
    .order("name");
  if (error) {
    console.error("topics read failed", error.message);
    return [];
  }
  return (data ?? []) as Topic[];
}

export async function getTopicBySlug(slug: string): Promise<Topic | null> {
  await connection();
  const db = createPublicClient();
  if (!db) return null;
  const { data } = await db
    .from("topics")
    .select("id, slug, name, description, status, created_at")
    .eq("slug", slug)
    .maybeSingle();
  return (data as Topic | null) ?? null;
}

export async function listPublicPicks(topicId: string): Promise<PublicPick[]> {
  await connection();
  const db = createPublicClient();
  if (!db) return [];
  const today = laToday();
  const { data, error } = await db
    .from("topic_videos")
    .select(
      `id, why_line, pick_date, pick_slot, level, length_bucket, video_id,
       videos!inner (id, youtube_video_id, title, channel_id, channel_title, duration_seconds,
         published_at, thumbnail_url, description, embeddable, privacy_status,
         youtube_data_fetched_at, is_unavailable)`,
    )
    .eq("topic_id", topicId)
    .eq("status", "approved")
    .not("pick_date", "is", null)
    .lte("pick_date", today)
    .order("pick_date", { ascending: false })
    .order("pick_slot", { ascending: true });
  if (error) {
    console.error("picks read failed", error.message);
    return [];
  }

  const rows = (data ?? []) as unknown as (Joined & { video_id: string })[];
  const videoIds = rows.flatMap((row) => {
    const video = oneVideo(row.videos);
    return video ? [video.id] : [];
  });
  const sourcesByVideo = new Map<string, SourceRow[]>();
  if (videoIds.length > 0) {
    const { data: sourceRows } = await db
      .from("recommendation_sources")
      .select("id, video_id, platform, source_url, quote_or_summary, recommended_at")
      .eq("topic_id", topicId)
      .in("video_id", videoIds);
    for (const source of (sourceRows ?? []) as (SourceRow & { video_id: string })[]) {
      const list = sourcesByVideo.get(source.video_id) ?? [];
      list.push(source);
      sourcesByVideo.set(source.video_id, list);
    }
  }

  const picks: PublicPick[] = [];
  for (const row of rows) {
    const video = oneVideo(row.videos);
    if (!video || !videoIsPublic(video) || !row.pick_date || !row.why_line?.trim()) continue;
    picks.push({
      topicVideoId: row.id,
      whyLine: row.why_line,
      pickDate: row.pick_date,
      pickSlot: row.pick_slot,
      level: row.level,
      lengthBucket: row.length_bucket,
      video,
      sources: sourcesByVideo.get(video.id) ?? [],
    });
  }
  return picks;
}

export async function getPublicPick(topicSlug: string, youtubeId: string) {
  const topic = await getTopicBySlug(topicSlug);
  if (!topic || topic.status !== "live") return null;
  const picks = await listPublicPicks(topic.id);
  const pick = picks.find((item) => item.video.youtube_video_id === youtubeId) ?? null;
  return { topic, pick, archive: picks.filter((item) => item !== pick).slice(0, 8) };
}
