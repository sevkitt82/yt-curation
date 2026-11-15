export type Topic = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: "live" | "requested" | "planned";
  created_at: string;
};

export type SourceConfig = {
  channels: string[];
  hn: boolean;
  keywords: string[];
  mastodon: string[];
  lemmy: string[];
};

export type VideoRow = {
  id: string;
  youtube_video_id: string;
  title: string | null;
  channel_id: string | null;
  channel_title: string | null;
  duration_seconds: number | null;
  published_at: string | null;
  thumbnail_url: string | null;
  description: string | null;
  embeddable: boolean | null;
  privacy_status: string | null;
  youtube_data_fetched_at: string | null;
  is_unavailable: boolean;
};

export type SourceRow = {
  id: string;
  platform: string;
  source_url: string | null;
  quote_or_summary: string | null;
  recommended_at: string | null;
  source_key?: string | null;
};

export type AppUser = {
  id: string;
  email: string;
  role: "admin" | "curator";
  topic_ids: string[];
};

export type LengthBucket = "short" | "medium" | "long";
export type Level = "beginner" | "intermediate" | "advanced";

export type PublicPick = {
  topicVideoId: string;
  whyLine: string;
  pickDate: string;
  pickSlot: number | null;
  level: Level | null;
  lengthBucket: LengthBucket | null;
  video: VideoRow;
  sources: SourceRow[];
};
