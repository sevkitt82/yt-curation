import { youtubeIdsInText } from "@/lib/youtube-id";

export type RawPost = {
  sourceUrl: string;
  text: string;
  excerpt: string;
  sourceScore: number | null;
  commentCount: number | null;
  recommendedAt: string | null;
};

export type FoundLink = RawPost & {
  youtubeId: string;
  sourceKey: string;
  platform: "reddit" | "hacker_news";
};

function decode(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function excerptFrom(text: string): string {
  const withoutUrls = text.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  return (withoutUrls || text).slice(0, 400);
}

function dateOnly(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function parseRedditRss(xml: string): RawPost[] {
  const posts: RawPost[] = [];
  for (const chunk of xml.split("<entry>").slice(1)) {
    const entry = chunk.split("</entry>")[0] ?? "";
    const link = entry.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? "";
    const title = decode(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
    const content = decode(entry.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] ?? "");
    const published = entry.match(/<published>([^<]+)<\/published>/)?.[1] ?? null;
    const text = `${title} ${content}`.trim();
    if (!link) continue;
    posts.push({
      sourceUrl: decode(link),
      text,
      excerpt: excerptFrom(text),
      sourceScore: null,
      commentCount: null,
      recommendedAt: dateOnly(published),
    });
  }
  return posts;
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
        excerpt: excerptFrom(hit.comment_text || hit.story_text || hit.title || hit.story_title || text),
        sourceScore: typeof hit.points === "number" ? hit.points : null,
        commentCount: typeof hit.num_comments === "number" ? hit.num_comments : null,
        recommendedAt: dateOnly(hit.created_at ?? null),
      },
    ];
  });
}

export function linksInPosts(
  posts: RawPost[],
  platform: "reddit" | "hacker_news",
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
