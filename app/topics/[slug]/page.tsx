import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RequestForm, SignupForm } from "@/components/viewer-forms";
import { TrackEvent } from "@/components/track-event";
import { VideoCard } from "@/components/video-card";
import { getTopicBySlug, listLiveTopics, listPublicPicks } from "@/lib/picks";
import type { LengthBucket, Level } from "@/lib/types";

const LENGTHS: LengthBucket[] = ["short", "medium", "long"];
const LEVELS: Level[] = ["beginner", "intermediate", "advanced"];

export default function TopicPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ length?: string; level?: string }>;
}) {
  return (
    <Suspense fallback={<p>Loading the pick…</p>}>
      <TopicContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function TopicContent({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ length?: string; level?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const topic = await getTopicBySlug(slug);
  if (!topic || topic.status !== "live") notFound();
  const topics = await listLiveTopics();
  const picks = await listPublicPicks(topic.id);
  const featured = picks[0] ?? null;
  const length = LENGTHS.find((item) => item === query.length) ?? null;
  const level = topic.slug === "ai-game-dev" ? (LEVELS.find((item) => item === query.level) ?? null) : null;
  const archive = picks.slice(1).filter((pick) => {
    if (length && pick.lengthBucket !== length) return false;
    if (level && pick.level !== level) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-6">
      <TrackEvent eventName="topic_view" topicId={topic.id} />
      <div>
        <p className="text-sm">
          <Link href="/">All topics</Link>
        </p>
        <h1 className="mt-2 text-4xl">{topic.name}</h1>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">{topic.description}</p>
      </div>

      {featured ? (
        <section>
          <h2 className="text-2xl">Today&apos;s pick</h2>
          <div className="mt-3">
            <VideoCard pick={featured} topicId={topic.id} topicSlug={topic.slug} />
          </div>
        </section>
      ) : (
        <div className="card p-5">
          <h2 className="text-2xl">No pick yet</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Nothing approved for {topic.name} is ready to show. Private, deleted, or non-embeddable videos stay hidden.
          </p>
        </div>
      )}

      <section id="archive">
        <h2 className="text-2xl">Archive</h2>
        <form className="mt-3 flex flex-wrap items-end gap-3" action={`/topics/${topic.slug}`}>
          <label className="field">
            Length
            <select name="length" defaultValue={length ?? ""}>
              <option value="">Any</option>
              {LENGTHS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          {topic.slug === "ai-game-dev" ? (
            <label className="field">
              Level
              <select name="level" defaultValue={level ?? ""}>
                <option value="">Any</option>
                {LEVELS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button className="btn-quiet">Filter</button>
        </form>
        {archive.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--muted)]">No older picks.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            {archive.map((pick) => (
              <VideoCard key={pick.topicVideoId} pick={pick} topicId={topic.id} topicSlug={topic.slug} />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <SignupForm topics={topics} preselect={topic.slug} />
        <RequestForm />
      </div>
    </div>
  );
}
