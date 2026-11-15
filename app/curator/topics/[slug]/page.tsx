import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { addVideos, runTopicDaily, saveWhyLine, updateCorrection, vetoPick } from "@/app/actions/curator";
import { curatorCanEdit, getCurator } from "@/lib/curator";
import { ratesFromPicks, smoothedRate } from "@/lib/pick-logic";
import { sourceKeyFor } from "@/lib/source-config";
import { createServerSupabase } from "@/lib/supabase/server";
import { addIsoDays, earliestPickDate, formatDate, laToday } from "@/lib/time";

export default function CuratorTopicPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <CuratorTopic params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CuratorTopic({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { slug } = await params;
  const { notice } = await searchParams;
  const curator = await getCurator();
  if (curator.status !== "ok") redirect("/curator");
  const supabase = await createServerSupabase();
  if (!supabase) notFound();
  const { data: topic } = await supabase.from("topics").select("id, slug, name").eq("slug", slug).maybeSingle();
  if (!topic || !curatorCanEdit(curator.appUser, topic.id)) notFound();

  const today = laToday();
  const earliest = earliestPickDate();
  const { data: picks } = await supabase
    .from("topic_videos")
    .select(
      `id, status, why_line, pick_date, video_id,
       videos (title, youtube_video_id, channel_id),
       recommendation_sources (platform, source_url, quote_or_summary)`,
    )
    .eq("topic_id", topic.id)
    .not("pick_date", "is", null)
    .order("pick_date", { ascending: true });

  const upcoming = (picks ?? []).filter(
    (row) => row.status === "approved" && (row.pick_date as string) >= today,
  );
  const scheduledDates = new Set(
    (picks ?? []).filter((row) => row.status === "approved").map((row) => row.pick_date as string),
  );
  const days = Array.from({ length: 14 }, (_, index) => addIsoDays(today, index));

  const { data: gap } = await supabase
    .from("analytics_events")
    .select("props, created_at")
    .eq("topic_id", topic.id)
    .eq("event_name", "pick_gap")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: past } = await supabase
    .from("topic_videos")
    .select("video_id, recommendation_sources (platform, source_url)")
    .eq("topic_id", topic.id)
    .eq("status", "approved")
    .not("pick_date", "is", null);
  const pastIds = (past ?? []).map((row) => row.video_id as string);
  const { data: votes } = pastIds.length
    ? await supabase
        .from("feedback")
        .select("video_id, value")
        .eq("topic_id", topic.id)
        .in("video_id", pastIds)
        .in("value", ["good", "not_good"])
    : { data: [] };
  const votesByVideo = new Map<string, { good: number; total: number }>();
  for (const vote of votes ?? []) {
    const current = votesByVideo.get(vote.video_id as string) ?? { good: 0, total: 0 };
    current.total += 1;
    if (vote.value === "good") current.good += 1;
    votesByVideo.set(vote.video_id as string, current);
  }
  const rates = ratesFromPicks(
    (past ?? []).map((row) => {
      const keys = ((row.recommendation_sources ?? []) as { platform: string; source_url: string | null; source_key?: string | null }[]).flatMap(
        (source) => {
          const key = sourceKeyFor(source.platform, source.source_url, source.source_key);
          return key ? [key] : [];
        },
      );
      const vote = votesByVideo.get(row.video_id as string) ?? { good: 0, total: 0 };
      return { keys, good: vote.good, total: vote.total };
    }),
  );

  const { data: corrections } = await supabase
    .from("correction_requests")
    .select("id, video_id, requester_email, message, status, created_at")
    .order("created_at", { ascending: false })
    .limit(40);
  const topicVideoIds = new Set((past ?? []).map((row) => row.video_id as string).concat((picks ?? []).map((row) => row.video_id as string)));
  const topicCorrections = (corrections ?? []).filter((row) => topicVideoIds.has(row.video_id as string));

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm">
        <Link href="/curator">All curator topics</Link>
      </p>
      <h1 className="text-3xl">{topic.name}</h1>
      {notice ? <p className="notice text-sm">{notice}</p> : null}
      {!scheduledDates.has(earliest) ? (
        <p className="notice text-sm">
          Gap: nothing is scheduled for {earliest}.
          {gap?.props && typeof gap.props === "object" && "reason" in gap.props
            ? ` Last error: ${String((gap.props as { reason?: string }).reason)}`
            : ""}
        </p>
      ) : null}

      <form action={runTopicDaily}>
        <input type="hidden" name="slug" value={topic.slug} />
        <button className="btn">Collect and pick</button>
      </form>

      <section>
        <h2 className="text-2xl">Upcoming</h2>
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {days.map((day) => {
            const pick = upcoming.find((row) => row.pick_date === day);
            const video = pick ? (Array.isArray(pick.videos) ? pick.videos[0] : pick.videos) : null;
            return (
              <li key={day} className="card p-3">
                <p className="font-medium">
                  {day}
                  {day === earliest ? " · next slot" : ""}
                  {pick ? "" : " · empty"}
                </p>
                {pick ? (
                  <div className="mt-2 flex flex-col gap-2">
                    <p>{video?.title ?? "Pick"}</p>
                    <form action={saveWhyLine} className="flex flex-col gap-2">
                      <input type="hidden" name="slug" value={topic.slug} />
                      <input type="hidden" name="topic_video_id" value={pick.id as string} />
                      <textarea name="why_line" rows={2} defaultValue={(pick.why_line as string | null) ?? ""} />
                      <button className="btn-quiet w-fit">Save why-line</button>
                    </form>
                    <form action={vetoPick}>
                      <input type="hidden" name="slug" value={topic.slug} />
                      <input type="hidden" name="topic_video_id" value={pick.id as string} />
                      <button className="btn-quiet">Veto</button>
                    </form>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="text-2xl">Source rates</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Internal. Smoothed as (good + 1) / (votes + 2). Not shown to viewers.</p>
        <ul className="mt-2 text-sm">
          {[...rates.entries()].map(([key, stat]) => (
            <li key={key}>
              {key}: {stat.rate.toFixed(2)} ({stat.good} good / {stat.total}, unsmoothed {stat.total ? (stat.good / stat.total).toFixed(2) : "n/a"}, prior {smoothedRate(0, 0).toFixed(2)})
            </li>
          ))}
        </ul>
        {rates.size === 0 ? <p className="text-sm">No votes on past picks yet.</p> : null}
      </section>

      <section>
        <h2 className="text-2xl">Reports</h2>
        <ul className="mt-2 flex flex-col gap-3 text-sm">
          {topicCorrections.map((row) => (
            <li key={row.id as string} className="card p-3">
              <p>{row.message as string}</p>
              <p className="text-[var(--muted)]">
                {row.status as string} · {(row.requester_email as string | null) || "no email"} · {formatDate(row.created_at as string)}
              </p>
              <form action={updateCorrection} className="mt-2 flex flex-wrap gap-2">
                <input type="hidden" name="slug" value={topic.slug} />
                <input type="hidden" name="id" value={row.id as string} />
                <select name="status" defaultValue={row.status as string}>
                  <option value="open">open</option>
                  <option value="reviewing">reviewing</option>
                  <option value="resolved">resolved</option>
                  <option value="rejected">rejected</option>
                </select>
                <button className="btn-quiet">Update</button>
              </form>
            </li>
          ))}
        </ul>
        {topicCorrections.length === 0 ? <p className="text-sm">No reports.</p> : null}
      </section>

      <section className="card p-4">
        <h2 className="text-2xl">Add a candidate</h2>
        <form action={addVideos} className="mt-3 grid gap-3">
          <input type="hidden" name="slug" value={topic.slug} />
          <label className="field">
            YouTube URLs or ids
            <textarea name="urls" rows={3} required />
          </label>
          <label className="field">
            Source URL
            <input name="source_url" type="url" />
          </label>
          <label className="field">
            Quote or summary
            <textarea name="quote" rows={2} />
          </label>
          <label className="field">
            Platform
            <select name="platform" defaultValue="reddit">
              <option value="reddit">reddit</option>
              <option value="hacker_news">hacker news</option>
              <option value="forum">forum</option>
              <option value="other">other</option>
            </select>
          </label>
          <button className="btn w-fit">Add candidate</button>
        </form>
      </section>
    </div>
  );
}
