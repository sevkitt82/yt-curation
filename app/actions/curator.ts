"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { runDaily } from "@/lib/daily";
import { pickTopic } from "@/lib/pick-topic";
import { laToday } from "@/lib/time";
import { curatorCanEdit, getCurator } from "@/lib/curator";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Level } from "@/lib/types";
import { fetchVideosList, metadataRow, type YoutubeMetadata } from "@/lib/youtube";
import { parseYouTubeIds } from "@/lib/youtube-id";

const PLATFORMS = new Set(["reddit", "hacker_news", "x", "forum", "curator", "other"]);
const LEVELS = new Set(["beginner", "intermediate", "advanced"]);
const CORRECTION_STATUSES = new Set(["open", "reviewing", "resolved", "rejected"]);

function notice(slug: string, message: string): never {
  redirect(`/curator/topics/${slug}?notice=${encodeURIComponent(message)}`);
}

function noticeRedirect(path: string, message: string): never {
  redirect(`${path}?notice=${encodeURIComponent(message)}`);
}

async function topicContext(slug: string) {
  const curator = await getCurator();
  if (curator.status === "signed_out") redirect("/curator/login");
  if (curator.status === "no_role") redirect("/curator");
  const supabase = await createServerSupabase();
  if (!supabase) redirect("/curator/login");
  const { data: topic } = await supabase
    .from("topics")
    .select("id, slug, name, description, status, created_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!topic || !curatorCanEdit(curator.appUser, topic.id)) redirect("/curator");
  return { curator, supabase, topic };
}

export async function saveChannels(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const { topic } = await topicContext(slug);
  const admin = createAdminClient();
  if (!admin) notice(slug, "SUPABASE_SECRET_KEY is not set.");
  const channels = String(formData.get("channels") ?? "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const { data: current } = await admin.from("topics").select("source_config").eq("id", topic.id).maybeSingle();
  const sourceConfig = { ...((current?.source_config as Record<string, unknown> | null) ?? {}), channels };
  const { error } = await admin.from("topics").update({ source_config: sourceConfig }).eq("id", topic.id);
  if (error) notice(slug, error.message);
  revalidatePath(`/curator/topics/${slug}`);
  notice(slug, channels.length ? `Saved ${channels.length} channels.` : "Channel list cleared.");
}

function sourceFromForm(formData: FormData, suffix: string) {
  const platform = String(formData.get(`platform${suffix}`) ?? "");
  const sourceUrl = String(formData.get(`source_url${suffix}`) ?? "").trim();
  const quote = String(formData.get(`quote${suffix}`) ?? "").trim();
  const recommendedAt = String(formData.get(`recommended_at${suffix}`) ?? "").trim();
  if (!sourceUrl && !quote) return null;
  if (!PLATFORMS.has(platform)) return { ok: false as const, message: "Choose a source platform." };
  return {
    ok: true as const,
    platform,
    source_url: sourceUrl || null,
    quote_or_summary: quote || null,
    recommended_at: recommendedAt || null,
  };
}

export async function requestMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const supabase = await createServerSupabase();
  if (!supabase) noticeRedirect("/curator/login", "Supabase is not configured.");
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${proto}://${host}/auth/callback`,
    },
  });
  if (error) noticeRedirect("/curator/login", error.message);
  noticeRedirect("/curator/login", "Check your email for the sign-in link. It only works for accounts that already exist.");
}

export async function signOutCurator() {
  const supabase = await createServerSupabase();
  if (supabase) await supabase.auth.signOut();
  redirect("/curator/login");
}

export async function addVideos(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const { curator, supabase, topic } = await topicContext(slug);
  const ids = parseYouTubeIds(String(formData.get("urls") ?? ""));
  if (ids.length === 0) notice(slug, "Paste at least one YouTube URL or video id.");

  const first = sourceFromForm(formData, "");
  const second = sourceFromForm(formData, "_2");
  if (first && !first.ok) notice(slug, first.message);
  if (second && !second.ok) notice(slug, second.message);
  const sources = [first, second].flatMap((source) => (source && source.ok ? [source] : []));
  if (sources.length === 0) notice(slug, "Add at least one recommendation source.");

  let fetched: Map<string, YoutubeMetadata>;
  try {
    fetched = await fetchVideosList(ids);
  } catch (error) {
    notice(slug, error instanceof Error ? error.message : "YouTube lookup failed.");
  }

  const levelRaw = String(formData.get("level") ?? "");
  const level = LEVELS.has(levelRaw) ? (levelRaw as Level) : null;
  const why = String(formData.get("why_line") ?? "").trim() || null;
  const added: string[] = [];

  for (const youtubeId of ids) {
    const meta = fetched.get(youtubeId);
    const row = meta
      ? metadataRow(meta)
      : {
          youtube_video_id: youtubeId,
          is_unavailable: true,
          youtube_data_fetched_at: new Date().toISOString(),
        };
    const { data: video, error: videoError } = await supabase
      .from("videos")
      .upsert(row, { onConflict: "youtube_video_id" })
      .select("id")
      .single();
    if (videoError || !video) notice(slug, videoError?.message ?? "Could not save the video.");

    const { data: existing } = await supabase
      .from("topic_videos")
      .select("id")
      .eq("topic_id", topic.id)
      .eq("video_id", video.id)
      .maybeSingle();
    if (!existing) {
      const { error: createError } = await supabase.from("topic_videos").insert({
        topic_id: topic.id,
        video_id: video.id,
        status: "candidate",
        why_line: why,
        level,
        length_bucket: meta?.lengthBucket ?? null,
      });
      if (createError) notice(slug, createError.message);
    }

    for (const source of sources) {
      await supabase.from("recommendation_sources").insert({
        platform: source.platform,
        source_url: source.source_url,
        quote_or_summary: source.quote_or_summary,
        recommended_at: source.recommended_at,
        video_id: video.id,
        topic_id: topic.id,
        added_by: curator.userId,
      });
    }
    added.push(youtubeId);
  }

  revalidatePath(`/curator/topics/${slug}`);
  notice(slug, `Added ${added.length} candidate${added.length === 1 ? "" : "s"}.`);
}

export async function saveWhyLine(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("topic_video_id") ?? "");
  const why = String(formData.get("why_line") ?? "").trim();
  const { supabase, topic } = await topicContext(slug);
  if (!why) notice(slug, "The why-line cannot be empty.");
  const { error } = await supabase
    .from("topic_videos")
    .update({ why_line: why })
    .eq("id", id)
    .eq("topic_id", topic.id);
  if (error) notice(slug, error.message);
  revalidatePath(`/curator/topics/${slug}`);
  revalidatePath(`/topics/${slug}`);
  notice(slug, "Why-line saved.");
}

export async function vetoPick(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("topic_video_id") ?? "");
  const { supabase, topic } = await topicContext(slug);
  const { data: current } = await supabase
    .from("topic_videos")
    .select("pick_date, pick_slot")
    .eq("id", id)
    .eq("topic_id", topic.id)
    .maybeSingle();
  const { error } = await supabase
    .from("topic_videos")
    .update({ status: "rejected", pick_date: null, pick_slot: null })
    .eq("id", id)
    .eq("topic_id", topic.id)
    .eq("status", "approved");
  if (error) notice(slug, error.message);

  const admin = createAdminClient();
  if (!admin) notice(slug, "Vetoed. Re-pick needs SUPABASE_SECRET_KEY.");
  const result = await pickTopic(admin, topic, {
    date: (current?.pick_date as string | null) ?? laToday(),
    onlySlot: (current?.pick_slot as number | null) ?? undefined,
  });
  revalidatePath(`/curator/topics/${slug}`);
  revalidatePath(`/topics/${slug}`);
  const replacement = result.picks?.[0];
  notice(
    slug,
    replacement
      ? `Vetoed. Slot ${replacement.slot} on ${result.pickDate} was filled again.`
      : `Vetoed. ${result.gap ?? result.skipped ?? "No replacement."}`,
  );
}

export async function runTopicDaily(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  await topicContext(slug);
  const admin = createAdminClient();
  if (!admin) notice(slug, "SUPABASE_SECRET_KEY is not set.");
  try {
    const [result] = await runDaily(admin, slug, laToday());
    revalidatePath(`/curator/topics/${slug}`);
    revalidatePath(`/topics/${slug}`);
    if (!result) notice(slug, "Topic not found.");
    if (result.gap) notice(slug, result.gap);
    if (result.picks?.length) {
      notice(slug, `Published ${result.picks.length} pick${result.picks.length === 1 ? "" : "s"} for ${result.pickDate}. Collected ${result.added} new videos.`);
    }
    notice(slug, result.skipped ?? "Nothing new to schedule.");
  } catch (error) {
    notice(slug, error instanceof Error ? error.message : "Daily run failed.");
  }
}

export async function updateCorrection(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const { supabase, topic } = await topicContext(slug);
  if (!CORRECTION_STATUSES.has(status)) notice(slug, "Unknown correction status.");
  const { data: request } = await supabase.from("correction_requests").select("id, video_id").eq("id", id).maybeSingle();
  if (!request) notice(slug, "Correction not found.");
  const { data: link } = await supabase
    .from("topic_videos")
    .select("id")
    .eq("topic_id", topic.id)
    .eq("video_id", request.video_id as string)
    .maybeSingle();
  if (!link) notice(slug, "That report is for another topic.");
  const { error } = await supabase.from("correction_requests").update({ status }).eq("id", id);
  if (error) notice(slug, error.message);
  revalidatePath(`/curator/topics/${slug}`);
  notice(slug, "Correction updated.");
}

export async function normalizeRequest(formData: FormData) {
  const curator = await getCurator();
  if (curator.status !== "ok" || curator.appUser.role !== "admin") redirect("/curator");
  const admin = createAdminClient();
  if (!admin) noticeRedirect("/curator/dashboard", "SUPABASE_SECRET_KEY is required to edit requests.");
  const id = String(formData.get("id") ?? "");
  const normalized = String(formData.get("normalized_topic") ?? "").trim();
  const { error } = await admin.from("topic_requests").update({ normalized_topic: normalized || null }).eq("id", id);
  if (error) noticeRedirect("/curator/dashboard", error.message);
  redirect("/curator/dashboard?notice=" + encodeURIComponent("Request label saved."));
}

export async function logPullSignal(formData: FormData) {
  const curator = await getCurator();
  if (curator.status !== "ok" || curator.appUser.role !== "admin") redirect("/curator");
  const admin = createAdminClient();
  if (!admin) noticeRedirect("/curator/dashboard", "SUPABASE_SECRET_KEY is required to log a pull signal.");
  const kind = String(formData.get("kind") ?? "");
  const topicId = String(formData.get("topic_id") ?? "") || null;
  const note = String(formData.get("note") ?? "").trim();
  if (kind !== "reply" && kind !== "would_pay") noticeRedirect("/curator/dashboard", "Choose reply or would-pay.");
  const { error } = await admin.from("analytics_events").insert({
    event_name: "pull_signal",
    topic_id: topicId,
    props: { kind, note },
  });
  if (error) noticeRedirect("/curator/dashboard", error.message);
  redirect("/curator/dashboard?notice=" + encodeURIComponent("Pull signal logged."));
}
