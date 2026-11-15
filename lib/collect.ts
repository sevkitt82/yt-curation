import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { COLLECTOR_USER_AGENT } from "@/lib/config";
import { linksInPosts, parseHnHits, parseLemmyPosts, parseMastodonStatuses, parseYouTubeUploads, postSummary, type FoundLink } from "@/lib/feeds";
import { sourceConfigFor } from "@/lib/source-config";
import type { SourceConfig } from "@/lib/types";
import { fetchVideosList, metadataRow } from "@/lib/youtube";

const OWNER_SCORE = 1;
const INDEPENDENT_SCORE = 3;

function sameName(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = left?.trim().toLowerCase() ?? "";
  const b = right?.trim().toLowerCase() ?? "";
  if (a.length < 4 || b.length < 4) return false;
  return a === b || a.includes(b) || b.includes(a);
}

async function readText(url: string): Promise<string | null> {
  const response = await fetch(url, { headers: { "User-Agent": COLLECTOR_USER_AGENT, Accept: "application/json, application/atom+xml, application/xml" } });
  if (response.status === 429) return null;
  if (!response.ok) throw new Error(`${url} returned ${response.status}.`);
  return response.text();
}

async function gather(config: SourceConfig): Promise<{ links: FoundLink[]; counts: Record<string, number>; errors: string[] }> {
  const links: FoundLink[] = [];
  const counts: Record<string, number> = {};
  const errors: string[] = [];
  const channelTitleByVideo = new Map<string, string>();

  for (const channelId of config.channels) {
    const key = `yt-channel:${channelId}`;
    try {
      const xml = await readText(`https://www.youtube.com/xml/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`);
      if (xml == null) {
        errors.push(`${key} was rate limited.`);
        break;
      }
      const feed = parseYouTubeUploads(xml);
      counts[key] = feed.videos.length;
      for (const video of feed.videos) {
        channelTitleByVideo.set(video.id, feed.channelTitle);
        links.push({
          sourceUrl: `https://www.youtube.com/watch?v=${video.id}`,
          text: `https://www.youtube.com/watch?v=${video.id}`,
          excerpt: postSummary(video.title, ""),
          sourceScore: OWNER_SCORE,
          commentCount: null,
          recommendedAt: video.published ? video.published.slice(0, 10) : null,
          youtubeId: video.id,
          sourceKey: key,
          platform: "other",
        });
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `${key} failed.`);
    }
  }

  const noteShare = (post: FoundLink) => {
    const owner = sameName(post.author, channelTitleByVideo.get(post.youtubeId));
    post.sourceScore = owner ? OWNER_SCORE : INDEPENDENT_SCORE;
    return post;
  };

  for (const tag of config.mastodon) {
    const key = `mastodon:#${tag}`;
    try {
      const body = await readText(`https://mastodon.social/api/v1/timelines/tag/${encodeURIComponent(tag)}?limit=40`);
      if (body == null) {
        errors.push(`${key} was rate limited.`);
        break;
      }
      const posts = parseMastodonStatuses(JSON.parse(body) as Parameters<typeof parseMastodonStatuses>[0]);
      const found = linksInPosts(posts, "forum", key).map(noteShare);
      counts[key] = found.length;
      links.push(...found);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `${key} failed.`);
    }
  }

  for (const community of config.lemmy) {
    const key = `lemmy:${community}`;
    const [host, , name] = community.split("/");
    try {
      const body = await readText(`https://${host}/api/v3/post/list?community_name=${encodeURIComponent(name ?? "")}&type_=All&sort=New&limit=40`);
      if (body == null) {
        errors.push(`${key} was rate limited.`);
        continue;
      }
      const parsed = JSON.parse(body) as { posts?: Parameters<typeof parseLemmyPosts>[0] };
      const posts = parseLemmyPosts(parsed.posts ?? [], `https://${community}`);
      const found = linksInPosts(posts, "forum", key).map(noteShare);
      counts[key] = found.length;
      links.push(...found);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `${key} failed.`);
    }
  }

  if (config.hn) {
    let hn = 0;
    for (const keyword of config.keywords) {
      try {
        const posts = await hnPosts(keyword);
        const found = linksInPosts(posts, "hacker_news", "hn:").map(noteShare);
        hn += found.length;
        links.push(...found);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "Hacker News search failed.");
      }
    }
    counts["hn:"] = hn;
  }

  return { links, counts, errors };
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

export async function collectTopic(
  admin: SupabaseClient,
  topic: { id: string; slug: string; source_config?: unknown },
): Promise<{ added: number; sources: number; counts: Record<string, number>; errors: string[]; error?: string }> {
  const config = sourceConfigFor(topic.slug, topic.source_config);
  const gathered = await gather(config);
  const { counts, errors } = gathered;
  if (errors.length) console.error("collect warnings", topic.slug, errors.join(" "));

  const unique = new Map<string, FoundLink>();
  for (const link of gathered.links) {
    const key = `${link.youtubeId} ${link.sourceUrl}`;
    if (!unique.has(key)) unique.set(key, link);
  }
  const found = [...unique.values()];
  if (found.length === 0) return { added: 0, sources: 0, counts, errors };

  const verified: FoundLink[] = [];
  for (const link of found) {
    const oembed = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${link.youtubeId}`)}&format=json`,
    );
    if (oembed.ok) verified.push(link);
  }
  if (verified.length === 0) return { added: 0, sources: 0, counts, errors };

  let metadata;
  try {
    metadata = await fetchVideosList(verified.map((link) => link.youtubeId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "videos.list failed.";
    console.error("collect availability failed", topic.slug, message);
    return { added: 0, sources: 0, counts, errors, error: message };
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

  return { added, sources, counts, errors };
}
