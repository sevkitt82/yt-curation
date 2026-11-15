import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RequestForm, SignupForm } from "@/components/viewer-forms";
import { TrackEvent } from "@/components/track-event";
import { VideoCard } from "@/components/video-card";
import { getTopicBySlug, listLiveTopics, listPublicPicks } from "@/lib/picks";
import { laToday } from "@/lib/time";
import type { LengthBucket, Level, PublicPick } from "@/lib/types";

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
  const today = laToday();
  const todays = picks.filter((pick) => pick.pickDate === today);
  const length = LENGTHS.find((item) => item === query.length) ?? null;
  const level = topic.slug === "ai-game-dev" ? (LEVELS.find((item) => item === query.level) ?? null) : null;
  const older = picks.filter((pick) => pick.pickDate !== today).filter((pick) => {
    if (length && pick.lengthBucket !== length) return false;
    if (level && pick.level !== level) return false;
    return true;
  });
  const archive = new Map<string, PublicPick[]>();
  for (const pick of older) {
    const group = archive.get(pick.pickDate) ?? [];
    group.push(pick);
    archive.set(pick.pickDate, group);
  }

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

      {todays.length > 0 ? (
        <section>
          <h2 className="text-2xl">Today&apos;s picks</h2>
          <div className="mt-3 flex flex-col gap-4">
            {todays.map((pick) => (
              <VideoCard key={pick.topicVideoId} pick={pick} topicId={topic.id} topicSlug={topic.slug} />
            ))}
          </div>
        </section>
      ) : (
        <div className="card p-5">
          <h2 className="text-2xl">No picks yet</h2>
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
        {archive.size === 0 ? (
          <p className="mt-3 text-sm text-[var(--muted)]">No older picks.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-6">
            {[...archive.entries()].map(([day, dayPicks]) => (
              <div key={day}>
                <h3 className="text-lg">{day}</h3>
                <div className="mt-2 flex flex-col gap-4">
                  {dayPicks.map((pick) => (
                    <VideoCard key={pick.topicVideoId} pick={pick} topicId={topic.id} topicSlug={topic.slug} />
                  ))}
                </div>
              </div>
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
