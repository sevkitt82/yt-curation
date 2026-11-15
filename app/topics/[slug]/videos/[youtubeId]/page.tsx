import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CorrectionForm } from "@/components/correction-form";
import { FeedbackForm } from "@/components/feedback-form";
import { SourceList } from "@/components/video-card";
import { TrackEvent } from "@/components/track-event";
import { TrackedLink, YouTubeOutbound } from "@/components/tracked-link";
import { YouTubePlayer } from "@/components/youtube-player";
import { getPublicPick } from "@/lib/picks";
import { formatDate, formatDuration } from "@/lib/time";

export default function VideoPage({ params }: { params: Promise<{ slug: string; youtubeId: string }> }) {
  return (
    <Suspense fallback={<p>Loading video…</p>}>
      <VideoContent params={params} />
    </Suspense>
  );
}

async function VideoContent({ params }: { params: Promise<{ slug: string; youtubeId: string }> }) {
  const { slug, youtubeId } = await params;
  const result = await getPublicPick(slug, youtubeId);
  if (!result?.pick) notFound();
  const { topic, pick, archive } = result;

  return (
    <div className="flex flex-col gap-6">
      <TrackEvent eventName="video_page_view" topicId={topic.id} videoId={pick.video.id} />
      <p className="text-sm">
        <Link href={`/topics/${topic.slug}`}>{topic.name}</Link>
        {" · "}
        <Link href={`/topics/${topic.slug}#archive`}>Archive</Link>
      </p>
      <YouTubePlayer youtubeId={pick.video.youtube_video_id} topicId={topic.id} videoId={pick.video.id} />
      <div className="max-w-2xl">
        <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{formatDate(pick.pickDate)}</p>
        <h1 className="mt-1 text-3xl">{pick.video.title}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {pick.video.channel_title} on YouTube · {formatDuration(pick.video.duration_seconds)}
        </p>
        <p className="mt-4">
          <span className="font-medium">Why this video: </span>
          {pick.whyLine}
        </p>
        <div className="mt-2">
          <SourceList sources={pick.sources} />
        </div>
        <p className="mt-4">
          <YouTubeOutbound youtubeId={pick.video.youtube_video_id} topicId={topic.id} videoId={pick.video.id} />
        </p>
        <div className="mt-4">
          <FeedbackForm topicId={topic.id} videoId={pick.video.id} />
        </div>
        <details className="mt-6">
          <summary className="cursor-pointer text-sm">Report a problem</summary>
          <div className="mt-3">
            <CorrectionForm videoId={pick.video.id} />
          </div>
        </details>
      </div>
      {archive.length > 0 ? (
        <section>
          <h2 className="text-2xl">From the archive</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {archive.map((other) => (
              <li key={other.topicVideoId}>
                <TrackedLink
                  href={`/topics/${topic.slug}/videos/${other.video.youtube_video_id}`}
                  eventName="video_card_click"
                  topicId={topic.id}
                  videoId={other.video.id}
                >
                  {other.video.title}
                </TrackedLink>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
