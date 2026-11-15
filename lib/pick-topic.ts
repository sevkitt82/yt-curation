import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { channelWeightingEnabled } from "@/lib/config";
import { anthropicPicker } from "@/lib/anthropic-pick";
import { sourceKeyFor } from "@/lib/source-config";
import { earliestPickDate } from "@/lib/time";
import {
  chooseFromPool,
  ratesFromPicks,
  type CandidateInput,
  type ModelChoice,
  type RateStat,
} from "@/lib/pick-logic";

type SourceJoin = {
  video_id: string;
  platform: string;
  source_url: string | null;
  quote_or_summary: string | null;
  source_key?: string | null;
  source_score?: number | null;
  comment_count?: number | null;
};

const SLOTS = [1, 2, 3] as const;

async function recordGap(admin: SupabaseClient, topicId: string, reason: string) {
  console.error("pick gap", topicId, reason);
  await admin.from("analytics_events").insert({
    event_name: "pick_gap",
    topic_id: topicId,
    props: { reason },
  });
}

async function sourcesFor(admin: SupabaseClient, topicId: string, videoIds: string[]) {
  const grouped = new Map<string, SourceJoin[]>();
  if (videoIds.length === 0) return grouped;
  const { data, error } = await admin
    .from("recommendation_sources")
    .select("video_id, platform, source_url, quote_or_summary, source_key, source_score, comment_count")
    .eq("topic_id", topicId)
    .in("video_id", videoIds);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as SourceJoin[]) {
    const list = grouped.get(row.video_id) ?? [];
    list.push(row);
    grouped.set(row.video_id, list);
  }
  return grouped;
}

export async function pickTopic(
  admin: SupabaseClient,
  topic: { id: string; slug: string },
  options?: { date?: string; onlySlot?: number },
): Promise<{
  pickDate?: string;
  picks?: { slot: number; youtubeId?: string; whyLine: string }[];
  gap?: string;
  skipped?: string;
}> {
  const date = options?.date ?? earliestPickDate();
  const { data: filled, error: filledError } = await admin
    .from("topic_videos")
    .select("pick_slot")
    .eq("topic_id", topic.id)
    .eq("status", "approved")
    .eq("pick_date", date);
  if (filledError) {
    await recordGap(admin, topic.id, filledError.message);
    return { gap: filledError.message };
  }
  const taken = new Set((filled ?? []).map((row) => row.pick_slot as number));
  let open = SLOTS.filter((slot) => !taken.has(slot));
  if (options?.onlySlot) open = open.filter((slot) => slot === options.onlySlot);
  if (open.length === 0) return { skipped: `${date} already has its picks.`, pickDate: date };

  const { data: pool, error: poolError } = await admin
    .from("topic_videos")
    .select(
      `id, video_id,
       videos!inner (id, youtube_video_id, channel_id, is_unavailable, embeddable, privacy_status)`,
    )
    .eq("topic_id", topic.id)
    .eq("status", "candidate")
    .is("pick_date", null);
  if (poolError) {
    await recordGap(admin, topic.id, poolError.message);
    return { gap: poolError.message };
  }
  const rows = pool ?? [];
  let poolSources: Map<string, SourceJoin[]>;
  try {
    poolSources = await sourcesFor(
      admin,
      topic.id,
      rows.map((row) => row.video_id as string),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read recommendation sources.";
    await recordGap(admin, topic.id, message);
    return { gap: message };
  }

  const channelOn = channelWeightingEnabled();
  const youtubeById = new Map<string, string>();
  const candidates: CandidateInput[] = [];
  for (const row of rows) {
    const video = Array.isArray(row.videos) ? row.videos[0] : row.videos;
    if (!video || video.is_unavailable || video.embeddable === false || video.privacy_status !== "public") continue;
    youtubeById.set(row.id as string, video.youtube_video_id as string);
    const sources = (poolSources.get(row.video_id as string) ?? []).flatMap((source) => {
      const key = sourceKeyFor(source.platform, source.source_url, source.source_key);
      if (!key) return [];
      return [
        {
          key,
          url: source.source_url,
          platform: source.platform,
          excerpt: source.quote_or_summary,
          sourceScore: source.source_score ?? null,
          commentCount: source.comment_count ?? null,
        },
      ];
    });
    if (sources.length === 0) continue;
    candidates.push({
      id: row.id as string,
      sources,
      ...(channelOn ? { channelId: (video.channel_id as string | null) ?? null } : {}),
    });
  }

  const { data: past } = await admin
    .from("topic_videos")
    .select(`id, pick_date, video_id, videos (channel_id)`)
    .eq("topic_id", topic.id)
    .eq("status", "approved")
    .not("pick_date", "is", null)
    .order("pick_date", { ascending: false })
    .limit(40);
  const pastRows = past ?? [];
  const pastSources = await sourcesFor(
    admin,
    topic.id,
    pastRows.map((row) => row.video_id as string),
  ).catch(() => new Map<string, SourceJoin[]>());

  const pastIds = pastRows.map((row) => row.video_id as string);
  const { data: votes } = pastIds.length
    ? await admin
        .from("feedback")
        .select("video_id, value")
        .eq("topic_id", topic.id)
        .in("video_id", pastIds)
        .in("value", ["good", "not_good"])
    : { data: [] };

  const votesByVideo = new Map<string, { good: number; total: number }>();
  for (const vote of votes ?? []) {
    const current = votesByVideo.get(vote.video_id as string) ?? { good: 0, total: 0 };
    current.total += 1;
    if (vote.value === "good") current.good += 1;
    votesByVideo.set(vote.video_id as string, current);
  }

  const rateRows = pastRows.map((row) => {
    const keys = (pastSources.get(row.video_id as string) ?? []).flatMap((source) => {
      const key = sourceKeyFor(source.platform, source.source_url, source.source_key);
      return key ? [key] : [];
    });
    const vote = votesByVideo.get(row.video_id as string) ?? { good: 0, total: 0 };
    return { keys, good: vote.good, total: vote.total };
  });
  const rates = ratesFromPicks(rateRows);
  const recentSourceKeys = rateRows.slice(0, 4).flatMap((row) => row.keys.slice(0, 1));

  let channelRates: Map<string, RateStat> | null = null;
  if (channelOn) {
    const byChannel = pastRows.map((row) => {
      const video = Array.isArray(row.videos) ? row.videos[0] : row.videos;
      const channelId = (video?.channel_id as string | null) ?? "";
      const vote = votesByVideo.get(row.video_id as string) ?? { good: 0, total: 0 };
      return { keys: channelId ? [channelId] : [], good: vote.good, total: vote.total };
    });
    channelRates = ratesFromPicks(byChannel);
  }

  const chosen = await chooseFromPool({
    candidates,
    rates,
    recentSourceKeys,
    channelRates,
    model: anthropicPicker(),
    count: open.length,
  });
  if (!chosen.ok) {
    await recordGap(admin, topic.id, chosen.gap);
    return { gap: chosen.gap };
  }

  const published: { slot: number; youtubeId?: string; whyLine: string }[] = [];
  for (const [index, choice] of chosen.choices.entries()) {
    const slot = open[index];
    if (!slot) break;
    const saved = await savePick(admin, topic.id, date, slot, choice);
    if (!saved.ok) {
      await recordGap(admin, topic.id, saved.message);
      if (published.length === 0) return { gap: saved.message };
      break;
    }
    published.push({ slot, youtubeId: youtubeById.get(choice.videoId), whyLine: choice.whyLine });
  }
  return { pickDate: date, picks: published };
}

async function savePick(
  admin: SupabaseClient,
  topicId: string,
  date: string,
  slot: number,
  choice: ModelChoice,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await admin
    .from("topic_videos")
    .update({
      status: "approved",
      pick_date: date,
      pick_slot: slot,
      why_line: choice.whyLine,
      pick_rationale: choice.rationale,
      picked_by: "ai",
      approved_at: new Date().toISOString(),
    })
    .eq("id", choice.videoId)
    .eq("topic_id", topicId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
