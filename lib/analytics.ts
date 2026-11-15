import "server-only";

import { createPublicClient } from "@/lib/supabase/public";
import { readAnonymousId, readSourceTag } from "@/lib/anon";

export async function recordEvent(input: {
  eventName: string;
  topicId?: string | null;
  videoId?: string | null;
  anonymousId?: string | null;
  props?: Record<string, string | number | boolean | null>;
}) {
  const db = createPublicClient();
  if (!db) return;
  const anonymousId = input.anonymousId ?? (await readAnonymousId());
  const sourceTag = await readSourceTag();
  const { error } = await db.from("analytics_events").insert({
    event_name: input.eventName,
    anonymous_id: anonymousId,
    topic_id: input.topicId ?? null,
    video_id: input.videoId ?? null,
    source_tag: sourceTag,
    props: input.props ?? null,
  });
  if (error) console.error("analytics insert failed", error.message);
}
