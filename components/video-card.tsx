import { FeedbackForm } from "@/components/feedback-form";
import { TrackedLink } from "@/components/tracked-link";
import { formatDate, formatDuration } from "@/lib/time";
import type { PublicPick } from "@/lib/types";

export function VideoCard({ pick, topicId, topicSlug }: { pick: PublicPick; topicId: string; topicSlug: string }) {
  const video = pick.video;
  const href = `/topics/${topicSlug}/videos/${video.youtube_video_id}`;
  return (
    <article className="card grid gap-4 p-4 sm:grid-cols-[180px_1fr]">
      <TrackedLink href={href} eventName="video_card_click" topicId={topicId} videoId={video.id} className="block">
        {video.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={video.thumbnail_url} alt="" className="aspect-video w-full rounded-md object-cover" />
        ) : (
          <div className="aspect-video w-full rounded-md bg-[var(--line)]" />
        )}
      </TrackedLink>
      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{formatDate(pick.pickDate)}</p>
        <h2 className="text-xl">
          <TrackedLink href={href} eventName="video_card_click" topicId={topicId} videoId={video.id} className="text-[var(--ink)]">
            {video.title ?? "Untitled video"}
          </TrackedLink>
        </h2>
        <p className="text-sm text-[var(--muted)]">
          {video.channel_title ?? "Unknown channel"} on YouTube · {formatDuration(video.duration_seconds)}
        </p>
        <p className="text-sm">
          <span className="font-medium">Why this video: </span>
          {pick.whyLine}
        </p>
        <SourceList sources={pick.sources} />
        <FeedbackForm topicId={topicId} videoId={video.id} />
      </div>
    </article>
  );
}

export function SourceList({ sources }: { sources: PublicPick["sources"] }) {
  if (sources.length === 0) return null;
  return (
    <ul className="list-disc pl-5 text-sm">
      {sources.map((source) => (
        <li key={source.id}>
          {source.source_url ? <a href={source.source_url}>{source.platform}</a> : source.platform}
          {source.quote_or_summary ? ` — ${source.quote_or_summary}` : ""}
        </li>
      ))}
    </ul>
  );
}
