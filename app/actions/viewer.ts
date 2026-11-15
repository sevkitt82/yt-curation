"use server";

import { revalidatePath } from "next/cache";
import { CONSENT_TEXT, CONSENT_VERSION } from "@/lib/config";
import { readAnonymousId, readSourceTag } from "@/lib/anon";
import { recordEvent } from "@/lib/analytics";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import { listLiveTopics } from "@/lib/picks";

export type ActionState = { ok: boolean; message: string; value?: string } | null;

const VIEWER_EVENTS = new Set([
  "landing_view",
  "topic_view",
  "video_card_click",
  "video_page_view",
  "player_play",
  "outbound_youtube_click",
]);

function emailOk(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function submitSignup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const consent = formData.get("consent") === "yes";
  if (!emailOk(email)) return { ok: false, message: "Enter a valid email address." };
  if (!consent) return { ok: false, message: "Consent is required before we can keep your email." };

  const topics = await listLiveTopics();
  const chosen = formData
    .getAll("topics")
    .map(String)
    .filter((slug) => topics.some((topic) => topic.slug === slug));
  if (chosen.length === 0) return { ok: false, message: "Choose at least one topic." };

  const db = createPublicClient();
  if (!db) return { ok: false, message: "The database is not configured." };

  const sourceTag = await readSourceTag();
  const { error } = await db.from("signups").insert({
    email,
    topics: chosen,
    consent_text_version: CONSENT_VERSION,
    source_tag: sourceTag,
  });
  if (error) {
    console.error("signup insert failed", error.message);
    return { ok: false, message: "Could not save the signup. Try again." };
  }

  // TODO: send the double opt-in email. confirm_token is generated in the database.
  // A later mailer should read it with SUPABASE_SECRET_KEY and link to /confirm?token=...
  await recordEvent({
    eventName: "signup_submitted",
    anonymousId: await readAnonymousId(String(formData.get("anonymous_id") ?? "")),
    props: { topics: chosen.join(",") },
  });

  revalidatePath("/");
  return {
    ok: true,
    message: `Saved for ${chosen.join(", ")}. A confirmation email is not sent yet — email delivery is not connected. Your signup stays unconfirmed until that is turned on. Consent version ${CONSENT_VERSION}: “${CONSENT_TEXT}”`,
  };
}

export async function submitTopicRequest(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const requested = String(formData.get("requested_topic") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "").trim().toLowerCase();
  if (requested.length < 2) return { ok: false, message: "Name the topic you want." };
  if (requested.length > 200) return { ok: false, message: "That topic name is too long." };
  if (emailRaw && !emailOk(emailRaw)) return { ok: false, message: "That email does not look valid." };

  const db = createPublicClient();
  if (!db) return { ok: false, message: "The database is not configured." };

  const anonymousId = await readAnonymousId(String(formData.get("anonymous_id") ?? ""));
  const { error } = await db.from("topic_requests").insert({
    requested_topic_text: requested,
    reason: reason || null,
    email: emailRaw || null,
    anonymous_id: anonymousId,
    source_tag: await readSourceTag(),
  });
  if (error) {
    console.error("topic request insert failed", error.message);
    return { ok: false, message: "Could not save the request. Try again." };
  }

  await recordEvent({
    eventName: "topic_request_submitted",
    anonymousId,
    props: { requested_topic: requested.slice(0, 80) },
  });

  return { ok: true, message: "Request saved. The most-requested topics get added first." };
}

export async function submitFeedback(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const value = String(formData.get("value") ?? "");
  const videoId = String(formData.get("video_id") ?? "");
  const topicId = String(formData.get("topic_id") ?? "");
  if (value !== "good" && value !== "not_good") {
    return { ok: false, message: "Choose Good or Not good." };
  }
  if (!videoId || !topicId) return { ok: false, message: "Missing video." };

  const anonymousId = await readAnonymousId(String(formData.get("anonymous_id") ?? ""));
  if (!anonymousId) return { ok: false, message: "This browser has no anonymous id yet. Reload and try again." };

  const db = createPublicClient();
  const admin = createAdminClient();
  const writer = admin ?? db;
  if (!writer) return { ok: false, message: "The database is not configured." };

  const row = {
    video_id: videoId,
    topic_id: topicId,
    anonymous_id: anonymousId,
    value,
    note: null,
  };
  const { error } = admin
    ? await admin.from("feedback").upsert(row, { onConflict: "topic_id,video_id,anonymous_id" })
    : await writer.from("feedback").insert(row);
  if (error) {
    console.error("feedback insert failed", error.message);
    return { ok: false, message: "Could not save feedback. Try again." };
  }

  await recordEvent({
    eventName: "feedback_submitted",
    topicId,
    videoId,
    anonymousId,
    props: { value },
  });
  return { ok: true, message: "Saved.", value };
}

export async function submitCorrection(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const videoId = String(formData.get("video_id") ?? "");
  const message = String(formData.get("message") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!videoId) return { ok: false, message: "Missing video." };
  if (message.length < 8) return { ok: false, message: "Tell us what to correct." };
  if (email && !emailOk(email)) return { ok: false, message: "That email does not look valid." };
  const db = createPublicClient();
  if (!db) return { ok: false, message: "The database is not configured." };
  const { error } = await db.from("correction_requests").insert({
    video_id: videoId,
    requester_email: email || null,
    message,
  });
  if (error) {
    console.error("correction insert failed", error.message);
    return { ok: false, message: "Could not save the report. Try again." };
  }
  return { ok: true, message: "Report saved. A curator will read it." };
}

export async function deleteMyData(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const anonymousId = String(formData.get("anonymous_id") ?? "").trim();
  if (!email && !anonymousId) {
    return { ok: false, message: "Enter the email you signed up with, or your browser id." };
  }
  if (email && !emailOk(email)) return { ok: false, message: "That email does not look valid." };

  const admin = createAdminClient();
  if (!admin) {
    return {
      ok: false,
      message: "Deletion is not available until SUPABASE_SECRET_KEY is set on the server.",
    };
  }

  if (email) {
    const signup = await admin.from("signups").delete().eq("email", email);
    const requests = await admin.from("topic_requests").delete().eq("email", email);
    const corrections = await admin.from("correction_requests").delete().eq("requester_email", email);
    if (signup.error || requests.error || corrections.error) {
      return { ok: false, message: "Could not delete email records. Try again." };
    }
  }

  if (anonymousId) {
    const feedback = await admin.from("feedback").delete().eq("anonymous_id", anonymousId);
    const requests = await admin.from("topic_requests").delete().eq("anonymous_id", anonymousId);
    if (feedback.error || requests.error) {
      return { ok: false, message: "Could not delete browser-id records. Try again." };
    }
  }

  return {
    ok: true,
    message: "Deleted matching signups, topic requests, feedback, and correction reports. Analytics events are not tied to your email and are kept.",
  };
}

export async function trackViewerEvent(input: {
  eventName: string;
  topicId?: string | null;
  videoId?: string | null;
  anonymousId?: string | null;
}) {
  if (!VIEWER_EVENTS.has(input.eventName)) return;
  await recordEvent({
    eventName: input.eventName,
    topicId: input.topicId,
    videoId: input.videoId,
    anonymousId: input.anonymousId,
  });
}
