import { youtubeIdsInText } from "@/lib/youtube-id";

export type RawPost = {
  sourceUrl: string;
  text: string;
  excerpt: string;
  sourceScore: number | null;
  commentCount: number | null;
  recommendedAt: string | null;
  author?: string | null;
};

export type FoundLink = RawPost & {
  youtubeId: string;
  sourceKey: string;
  platform: "hacker_news" | "forum" | "other";
};

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/** Plain text: decode entities first so escaped tags can be removed. */
export function plainText(value: string): string {
  let text = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  for (let i = 0; i < 3; i++) {
    const decoded = decodeEntities(text);
    if (decoded === text) break;
    text = decoded;
  }
  text = text.replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ");
  text = decodeEntities(text);
  return text.replace(/\s+/g, " ").trim();
}

function withoutBoilerplate(value: string): string {
  return value
    .replace(/\bsubmitted by\b[\s\S]*$/i, "")
    .replace(/\[(link|comments)\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Title, then a short body, together at most 200 characters. */
export function postSummary(title: string, body: string): string {
  const cleanTitle = withoutBoilerplate(plainText(title)).slice(0, 200);
  let rest = withoutBoilerplate(plainText(body));
  if (cleanTitle && rest.toLowerCase().startsWith(cleanTitle.toLowerCase())) {
    rest = rest.slice(cleanTitle.length).trim();
  }
  const room = 200 - cleanTitle.length - 1;
  const excerpt = room > 0 ? rest.slice(0, room).trim() : "";
  if (!cleanTitle) return excerpt.slice(0, 200);
  return excerpt ? `${cleanTitle}\n${excerpt}` : cleanTitle;
}

/** Repair a quote already saved from an older Reddit feed parse. */
export function cleanStoredQuote(raw: string): string {
  const title = plainText(raw.split(/<|<!--|\bsubmitted by\b/i)[0] ?? "");
  return postSummary(title, raw);
}

function dateOnly(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function parseYouTubeUploads(xml: string): { channelTitle: string; videos: { id: string; title: string; published: string | null }[] } {
  const channelTitle = plainText(xml.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
  const videos = [];
  for (const chunk of xml.split("<entry>").slice(1)) {
    const entry = chunk.split("</entry>")[0] ?? "";
    const id = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1]?.trim() ?? "";
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) continue;
    videos.push({
      id,
      title: plainText(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ""),
      published: entry.match(/<published>([^<]+)<\/published>/)?.[1] ?? null,
    });
  }
  return { channelTitle, videos };
}

type MastoStatus = {
  content?: string;
  url?: string;
  created_at?: string;
  account?: { display_name?: string; acct?: string };
};

export function parseMastodonStatuses(statuses: MastoStatus[]): RawPost[] {
  return statuses.flatMap((status) => {
    if (!status.url) return [];
    const text = plainText(status.content ?? "");
    return [
      {
        sourceUrl: status.url,
        text: `${text} ${status.content ?? ""}`,
        excerpt: postSummary(text.slice(0, 120), text),
        sourceScore: null,
        commentCount: null,
        recommendedAt: dateOnly(status.created_at ?? null),
        author: status.account?.display_name || status.account?.acct || null,
      },
    ];
  });
}

type LemmyPost = {
  post?: { name?: string; body?: string | null; url?: string | null; ap_id?: string; published?: string };
  creator?: { name?: string; display_name?: string | null };
};

export function parseLemmyPosts(posts: LemmyPost[], communityUrl: string): RawPost[] {
  return posts.flatMap((item) => {
    const post = item.post;
    if (!post?.ap_id && !post?.url) return [];
    const title = post.name ?? "";
    const body = post.body ?? "";
    return [
      {
        sourceUrl: post.ap_id || `${communityUrl}`,
        text: `${title} ${body} ${post.url ?? ""}`,
        excerpt: postSummary(title, body),
        sourceScore: null,
        commentCount: null,
        recommendedAt: dateOnly(post.published ?? null),
        author: item.creator?.display_name || item.creator?.name || null,
      },
    ];
  });
}

type HnHit = {
  objectID?: string;
  url?: string | null;
  title?: string | null;
  story_title?: string | null;
  story_text?: string | null;
  comment_text?: string | null;
  points?: number | null;
  num_comments?: number | null;
  created_at?: string | null;
  author?: string | null;
};

export function parseHnHits(hits: HnHit[]): RawPost[] {
  return hits.flatMap((hit) => {
    if (!hit.objectID) return [];
    const text = [hit.title, hit.story_title, hit.story_text, hit.comment_text, hit.url]
      .filter(Boolean)
      .join(" ");
    return [
      {
        sourceUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
        text,
        excerpt: postSummary(hit.title || hit.story_title || "", hit.comment_text || hit.story_text || ""),
        sourceScore: typeof hit.points === "number" ? hit.points : null,
        commentCount: typeof hit.num_comments === "number" ? hit.num_comments : null,
        recommendedAt: dateOnly(hit.created_at ?? null),
        author: hit.author ?? null,
      },
    ];
  });
}

export function linksInPosts(
  posts: RawPost[],
  platform: "hacker_news" | "forum" | "other",
  sourceKey: string,
): FoundLink[] {
  const found: FoundLink[] = [];
  for (const post of posts) {
    for (const youtubeId of youtubeIdsInText(post.text)) {
      found.push({ ...post, youtubeId, platform, sourceKey });
    }
  }
  return found;
}
