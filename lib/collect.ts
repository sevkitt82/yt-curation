import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { COLLECTOR_USER_AGENT } from "@/lib/config";
import { linksInPosts, parseHnHits, parseRedditRss, type FoundLink } from "@/lib/feeds";
import { sourceConfigFor } from "@/lib/source-config";
import type { SourceConfig } from "@/lib/types";
import { fetchVideosList, metadataRow } from "@/lib/youtube";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function redditPosts(subreddit: string) {
  const headers = { "User-Agent": COLLECTOR_USER_AGENT, Accept: "application/json, application/atom+xml" };
  const jsonResponse = await fetch(`https://www.reddit.com/r/${subreddit}/new.json?limit=25`, { headers });
  if (jsonResponse.ok) {
    const body = (await jsonResponse.json()) as {
      data?: { children?: { data?: Record<string, unknown> }[] };
    };
    return (body.data?.children ?? []).flatMap((child) => {
      const data = child.data ?? {};
      const permalink = typeof data.permalink === "string" ? `https://www.reddit.com${data.permalink}` : "";
      const text = [data.title, data.selftext, data.url].filter((item) => typeof item === "string").join(" ");
      if (!permalink) return [];
      return [
        {
          sourceUrl: permalink,
          text,
          excerpt: String(data.title ?? text).slice(0, 400),
          sourceScore: typeof data.score === "number" ? data.score : null,
          commentCount: typeof data.num_comments === "number" ? data.num_comments : null,
          recommendedAt:
            typeof data.created_utc === "number"
              ? new Date(data.created_utc * 1000).toISOString().slice(0, 10)
              : null,
        },
      ];
    });
  }
  let rssResponse = await fetch(`https://www.reddit.com/r/${subreddit}/new.rss?limit=25`, { headers });
  if (rssResponse.status === 429) {
    await pause(2000);
    rssResponse = await fetch(`https://www.reddit.com/r/${subreddit}/new.rss?limit=25`, { headers });
  }
  if (!rssResponse.ok) throw new Error(`Reddit r/${subreddit} returned ${rssResponse.status}.`);
  return parseRedditRss(await rssResponse.text());
}

async function hnPosts(keyword: string) {
  const posts = [];
  for (const tags of ["story", "comment"]) {
    const url = new URL("https://hn.algolia.com/api/v1/search_by_date");
    url.searchParams.set("query", keyword);
    url.searchParams.set("tags", tags);
    url.searchParams.set("hitsPerPage", "30");
    const response = await fetch(url, { headers: { "User-Agent": COLLECTOR_USER_AGENT } });
    if (!response.ok) throw new Error(`Hacker News search returned ${response.status}.`);
    const body = (await response.json()) as { hits?: Parameters<typeof parseHnHits>[0] };
    posts.push(...parseHnHits(body.hits ?? []));
  }
  return posts;
}

async function gather(config: SourceConfig): Promise<FoundLink[]> {
  const links: FoundLink[] = [];
  for (const [index, subreddit] of config.subreddits.entries()) {
    if (index > 0) await pause(2000);
    const posts = await redditPosts(subreddit);
    links.push(...linksInPosts(posts, "reddit", `reddit:r/${subreddit}`));
  }
  if (config.hn) {
    for (const keyword of config.keywords) {
      const posts = await hnPosts(keyword);
      links.push(...linksInPosts(posts, "hacker_news", "hn:"));
    }
  }
  return links;
}

export async function collectTopic(
  admin: SupabaseClient,
  topic: { id: string; slug: string; source_config?: unknown },
): Promise<{ added: number; sources: number; error?: string }> {
  const config = sourceConfigFor(topic.slug, topic.source_config);
  let links: FoundLink[];
  try {
    links = await gather(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Collection failed.";
    console.error("collect failed", topic.slug, message);
    return { added: 0, sources: 0, error: message };
  }

  const unique = new Map<string, FoundLink>();
  for (const link of links) {
    const key = `${link.youtubeId} ${link.sourceUrl}`;
    if (!unique.has(key)) unique.set(key, link);
  }
  const found = [...unique.values()];
  if (found.length === 0) return { added: 0, sources: 0 };

  const verified: FoundLink[] = [];
  for (const link of found) {
    const oembed = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${link.youtubeId}`)}&format=json`,
    );
    if (oembed.ok) verified.push(link);
  }
  if (verified.length === 0) return { added: 0, sources: 0 };

  let metadata;
  try {
    metadata = await fetchVideosList(verified.map((link) => link.youtubeId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "videos.list failed.";
    console.error("collect availability failed", topic.slug, message);
    return { added: 0, sources: 0, error: message };
  }

  let added = 0;
  let sources = 0;
  const seenVideos = new Set<string>();
  for (const link of verified) {
    const meta = metadata.get(link.youtubeId);
    const row = meta
      ? metadataRow(meta)
      : {
          youtube_video_id: link.youtubeId,
          is_unavailable: true,
          youtube_data_fetched_at: new Date().toISOString(),
        };
    const { data: video, error: videoError } = await admin
      .from("videos")
      .upsert(row, { onConflict: "youtube_video_id" })
      .select("id")
      .single();
    if (videoError || !video) {
      console.error("video upsert failed", videoError?.message);
      continue;
    }

    if (!seenVideos.has(video.id)) {
      seenVideos.add(video.id);
      const { data: existing } = await admin
        .from("topic_videos")
        .select("id")
        .eq("topic_id", topic.id)
        .eq("video_id", video.id)
        .maybeSingle();
      if (!existing) {
        const { error } = await admin.from("topic_videos").insert({
          topic_id: topic.id,
          video_id: video.id,
          status: "candidate",
          length_bucket: meta?.lengthBucket ?? null,
        });
        if (!error) added += 1;
      }
    }

    const { data: source } = await admin
      .from("recommendation_sources")
      .select("id")
      .eq("topic_id", topic.id)
      .eq("video_id", video.id)
      .eq("source_url", link.sourceUrl)
      .maybeSingle();
    if (source) continue;
    const { error } = await admin.from("recommendation_sources").insert({
      topic_id: topic.id,
      video_id: video.id,
      platform: link.platform,
      source_url: link.sourceUrl,
      quote_or_summary: link.excerpt,
      recommended_at: link.recommendedAt,
      source_key: link.sourceKey,
      source_score: link.sourceScore,
      comment_count: link.commentCount,
    });
    if (!error) sources += 1;
  }

  return { added, sources };
}
