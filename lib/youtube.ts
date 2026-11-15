import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { lengthBucket, parseIsoDuration } from "@/lib/time";
import type { LengthBucket } from "@/lib/types";

export type YoutubeMetadata = {
  youtubeVideoId: string;
  title: string | null;
  channelId: string | null;
  channelTitle: string | null;
  description: string | null;
  publishedAt: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  lengthBucket: LengthBucket | null;
  embeddable: boolean | null;
  privacyStatus: string | null;
  isUnavailable: boolean;
};

type ApiItem = {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    channelId?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: {
      high?: { url?: string };
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
  contentDetails?: { duration?: string };
  status?: { embeddable?: boolean; privacyStatus?: string; uploadStatus?: string };
};

export async function logQuota(endpoint: string, units: number) {
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SECRET_KEY is not set, so quota cannot be logged.");
  const { error } = await admin.from("quota_log").insert({ endpoint, units });
  if (error) throw new Error(`quota_log insert failed: ${error.message}`);
}

function mapItem(item: ApiItem): YoutubeMetadata | null {
  if (!item.id) return null;
  const thumb =
    item.snippet?.thumbnails?.high?.url ??
    item.snippet?.thumbnails?.medium?.url ??
    item.snippet?.thumbnails?.default?.url ??
    null;
  const durationSeconds = parseIsoDuration(item.contentDetails?.duration);
  const privacyStatus = item.status?.privacyStatus ?? null;
  const embeddable = item.status?.embeddable ?? null;
  const uploadFailed = item.status?.uploadStatus === "deleted" || item.status?.uploadStatus === "failed";
  const isUnavailable = uploadFailed || privacyStatus !== "public" || embeddable === false;
  return {
    youtubeVideoId: item.id,
    title: item.snippet?.title ?? null,
    channelId: item.snippet?.channelId ?? null,
    channelTitle: item.snippet?.channelTitle ?? null,
    description: item.snippet?.description ?? null,
    publishedAt: item.snippet?.publishedAt ?? null,
    thumbnailUrl: thumb,
    durationSeconds,
    lengthBucket: lengthBucket(durationSeconds),
    embeddable,
    privacyStatus,
    isUnavailable,
  };
}

/** videos.list only. One unit per call, up to 50 ids. Never search.list. */
export async function fetchVideosList(ids: string[]): Promise<Map<string, YoutubeMetadata>> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY is not set.");
  if (!createAdminClient()) {
    throw new Error("SUPABASE_SECRET_KEY is not set, so quota cannot be logged.");
  }

  const unique = [...new Set(ids)];
  const found = new Map<string, YoutubeMetadata>();

  for (let index = 0; index < unique.length; index += 50) {
    const batch = unique.slice(index, index + 50);
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet,contentDetails,status");
    url.searchParams.set("id", batch.join(","));
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("key", key);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`videos.list failed with status ${response.status}.`);
    }
    await logQuota("videos.list", 1);
    const body = (await response.json()) as { items?: ApiItem[] };
    for (const item of body.items ?? []) {
      const mapped = mapItem(item);
      if (mapped) found.set(mapped.youtubeVideoId, mapped);
    }
  }

  return found;
}

export function metadataRow(meta: YoutubeMetadata) {
  return {
    youtube_video_id: meta.youtubeVideoId,
    title: meta.title,
    channel_id: meta.channelId,
    channel_title: meta.channelTitle,
    description: meta.description,
    published_at: meta.publishedAt,
    thumbnail_url: meta.thumbnailUrl,
    duration_seconds: meta.durationSeconds,
    embeddable: meta.embeddable,
    privacy_status: meta.privacyStatus,
    is_unavailable: meta.isUnavailable,
    youtube_data_fetched_at: new Date().toISOString(),
  };
}
