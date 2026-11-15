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
  type RateStat,
} from "@/lib/pick-logic";

type SourceJoin = {
  platform: string;
  source_url: string | null;
  quote_or_summary: string | null;
  source_key?: string | null;
  source_score?: number | null;
  comment_count?: number | null;
};

async function recordGap(admin: SupabaseClient, topicId: string, reason: string) {
  console.error("pick gap", topicId, reason);
  await admin.from("analytics_events").insert({
    event_name: "pick_gap",
    topic_id: topicId,
    props: { reason },
  });
}

export async function pickTopic(
  admin: SupabaseClient,
  topic: { id: string; slug: string },
): Promise<{ pickDate?: string; gap?: string; skipped?: string }> {
  const earliest = earliestPickDate();
  const { data: scheduled, error: scheduledError } = await admin
    .from("topic_videos")
    .select("pick_date")
    .eq("topic_id", topic.id)
    .eq("status", "approved")
    .eq("pick_date", earliest)
    .limit(1);
  if (scheduledError) {
    await recordGap(admin, topic.id, scheduledError.message);
    return { gap: scheduledError.message };
  }
  if ((scheduled ?? []).length > 0) return { skipped: `${earliest} already has a pick.` };

  const { data: pool, error: poolError } = await admin
    .from("topic_videos")
    .select(
      `id, video_id,
       videos!inner (id, channel_id, is_unavailable, embeddable, privacy_status),
       recommendation_sources (platform, source_url, quote_or_summary, source_key, source_score, comment_count)`,
    )
    .eq("topic_id", topic.id)
    .eq("status", "candidate")
    .is("pick_date", null);
  if (poolError) {
    await recordGap(admin, topic.id, poolError.message);
    return { gap: poolError.message };
  }

  const channelOn = channelWeightingEnabled();
  const candidates: CandidateInput[] = [];
  for (const row of pool ?? []) {
    const video = Array.isArray(row.videos) ? row.videos[0] : row.videos;
    if (!video || video.is_unavailable || video.embeddable === false || video.privacy_status !== "public") continue;
    const sources = ((row.recommendation_sources ?? []) as SourceJoin[]).flatMap((source) => {
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
    .select(
      `id, pick_date, video_id,
       videos (channel_id),
       recommendation_sources (platform, source_url, source_key)`,
    )
    .eq("topic_id", topic.id)
    .eq("status", "approved")
    .not("pick_date", "is", null)
    .order("pick_date", { ascending: false })
    .limit(40);

  const pastIds = (past ?? []).map((row) => row.video_id as string);
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

  const rateRows = (past ?? []).map((row) => {
    const keys = ((row.recommendation_sources ?? []) as SourceJoin[]).flatMap((source) => {
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
    const byChannel = (past ?? []).map((row) => {
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
  });
  if (!chosen.ok) {
    await recordGap(admin, topic.id, chosen.gap);
    return { gap: chosen.gap };
  }

  const { error } = await admin
    .from("topic_videos")
    .update({
      status: "approved",
      pick_date: earliest,
      why_line: chosen.choice.whyLine,
      pick_rationale: chosen.choice.rationale,
      picked_by: "ai",
      approved_at: new Date().toISOString(),
    })
    .eq("id", chosen.choice.videoId)
    .eq("topic_id", topic.id);
  if (error) {
    await recordGap(admin, topic.id, error.message);
    return { gap: error.message };
  }
  return { pickDate: earliest };
}
