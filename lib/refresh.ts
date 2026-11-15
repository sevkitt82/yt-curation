import "server-only";

import { YOUTUBE_REFRESH_AFTER_DAYS } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { daysAgoIso } from "@/lib/time";
import { fetchVideosList, metadataRow } from "@/lib/youtube";

type StaleVideo = {
  id: string;
  youtube_video_id: string;
  title: string | null;
  thumbnail_url: string | null;
};

export async function refreshStaleYoutubeVideos() {
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SECRET_KEY is not set.");

  const cutoff = daysAgoIso(YOUTUBE_REFRESH_AFTER_DAYS);
  const { data, error } = await admin
    .from("videos")
    .select("id, youtube_video_id, title, thumbnail_url")
    .or(`youtube_data_fetched_at.is.null,youtube_data_fetched_at.lt.${cutoff}`);

  if (error) throw new Error(error.message);
  const stale = (data ?? []) as StaleVideo[];
  if (stale.length === 0) return { checked: 0, updated: 0, hidden: 0 };

  const fetched = await fetchVideosList(stale.map((video) => video.youtube_video_id));
  let updated = 0;
  let hidden = 0;

  for (const video of stale) {
    const meta = fetched.get(video.youtube_video_id);
    if (!meta) {
      const { error: hideError } = await admin
        .from("videos")
        .update({
          is_unavailable: true,
          privacy_status: "missing",
          embeddable: false,
          youtube_data_fetched_at: new Date().toISOString(),
        })
        .eq("id", video.id);
      if (hideError) throw new Error(hideError.message);
      hidden += 1;
      continue;
    }

    const { error: updateError } = await admin.from("videos").update(metadataRow(meta)).eq("id", video.id);
    if (updateError) throw new Error(updateError.message);
    updated += 1;
    if (meta.isUnavailable) hidden += 1;
  }

  return { checked: stale.length, updated, hidden };
}
