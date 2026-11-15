import type { SourceConfig } from "@/lib/types";

export const SOURCE_DEFAULTS: Record<string, SourceConfig> = {
  starfield: {
    hn: false,
    subreddits: ["Starfield", "starfieldmods"],
    keywords: ["starfield"],
  },
  "ai-game-dev": {
    hn: true,
    subreddits: ["aigamedev", "gamedev"],
    keywords: ["AI game development", "AI npc", "generative game"],
  },
};

export function sourceConfigFor(slug: string, raw: unknown): SourceConfig {
  const fallback = SOURCE_DEFAULTS[slug] ?? { hn: false, subreddits: [], keywords: [] };
  if (!raw || typeof raw !== "object") return fallback;
  const record = raw as Record<string, unknown>;
  const subreddits = Array.isArray(record.subreddits)
    ? record.subreddits.map((item) => String(item).replace(/^r\//i, "")).filter(Boolean)
    : fallback.subreddits;
  const keywords = Array.isArray(record.keywords)
    ? record.keywords.map((item) => String(item)).filter(Boolean)
    : fallback.keywords;
  const hn = typeof record.hn === "boolean" ? record.hn : fallback.hn;
  return {
    hn,
    subreddits: subreddits.length ? subreddits : fallback.subreddits,
    keywords: keywords.length ? keywords : fallback.keywords,
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
