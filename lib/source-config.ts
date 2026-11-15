import type { SourceConfig } from "@/lib/types";

export const SOURCE_DEFAULTS: Record<string, SourceConfig> = {
  starfield: {
    channels: [],
    hn: false,
    keywords: ["starfield"],
    mastodon: ["starfield"],
    lemmy: ["lemmy.zip/c/starfield"],
  },
  "ai-game-dev": {
    channels: [],
    hn: true,
    keywords: ["AI game development", "AI npc", "generative game"],
    mastodon: ["gamedev", "indiedev"],
    lemmy: ["programming.dev/c/gamedev"],
  },
};

function stringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const items = value.map((item) => String(item).trim()).filter(Boolean);
  return items.length ? items : fallback;
}

export function sourceConfigFor(slug: string, raw: unknown): SourceConfig {
  const fallback = SOURCE_DEFAULTS[slug] ?? {
    channels: [],
    hn: false,
    keywords: [],
    mastodon: [],
    lemmy: [],
  };
  if (!raw || typeof raw !== "object") return fallback;
  const record = raw as Record<string, unknown>;
  return {
    channels: Array.isArray(record.channels)
      ? record.channels.map((item) => String(item).trim()).filter(Boolean)
      : fallback.channels,
    hn: typeof record.hn === "boolean" ? record.hn : fallback.hn,
    keywords: stringList(record.keywords, fallback.keywords),
    mastodon: stringList(record.mastodon, fallback.mastodon).map((tag) => tag.replace(/^#/, "")),
    lemmy: stringList(record.lemmy, fallback.lemmy),
  };
}

export function sourceKeyFor(platform: string, sourceUrl: string | null, stored?: string | null): string | null {
  if (stored) return stored;
  if (platform === "hacker_news") return "hn:";
  const match = sourceUrl?.match(/reddit\.com\/r\/([^/?#]+)/i);
  if (match?.[1]) return `reddit:r/${match[1]}`;
  if (platform === "reddit") return "reddit:";
  return null;
}
