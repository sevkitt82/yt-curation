import { Suspense } from "react";
import Link from "next/link";
import { RequestForm, SignupForm } from "@/components/viewer-forms";
import { TrackEvent } from "@/components/track-event";
import { listLiveTopics } from "@/lib/picks";

export default function HomePage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  const topics = await listLiveTopics();
  return (
    <div className="flex flex-col gap-8">
      <TrackEvent eventName="landing_view" />
      <section className="max-w-2xl">
        <p className="text-sm uppercase tracking-wide text-[var(--muted)]">Working title</p>
        <h1 className="mt-2 text-4xl leading-tight">Only the YouTube videos worth your time.</h1>
        <p className="mt-4 text-lg text-[var(--muted)]">
          Three videos a day on AI game development and Starfield, taken from what people recommend elsewhere. A short
          note says why it&apos;s here. No view counts. No like counts.
        </p>
        <ul className="mt-4 list-disc pl-5 text-sm">
          <li>Picked from trusted channels and posts on Mastodon, Lemmy, and Hacker News</li>
          <li>Every video has a why-line that cites the recommendation</li>
          <li>Good or Not good — your vote stays private</li>
        </ul>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {topics.map((topic) => (
          <Link key={topic.id} href={`/topics/${topic.slug}`} className="card p-5 text-[var(--ink)] no-underline">
            <h2 className="text-2xl">{topic.name}</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">{topic.description}</p>
          </Link>
        ))}
      </section>

      <section className="max-w-2xl text-sm">
        <h2 className="text-2xl">How we pick</h2>
        <p className="mt-2 text-[var(--muted)]">
          Each day three videos are chosen from trusted channels and from links people share on Mastodon, Lemmy, or Hacker News, with a short note
          that cites the post. Your Good or Not good votes stay off the page and steer later choices. Nothing here
          uses YouTube views or likes. <Link href="/how-we-pick">Read the full note</Link>.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <SignupForm topics={topics} />
        <RequestForm />
      </div>
    </div>
  );
}
