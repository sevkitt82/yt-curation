"use client";

import Link from "next/link";
import { useTransition } from "react";
import { trackViewerEvent } from "@/app/actions/viewer";
import { anonymousIdFromBrowser } from "@/components/anon-sync";

export function TrackedLink({
  href,
  eventName,
  topicId,
  videoId,
  className,
  children,
}: {
  href: string;
  eventName: string;
  topicId?: string | null;
  videoId?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  const [, startTransition] = useTransition();
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        startTransition(() => {
          void trackViewerEvent({
            eventName,
            topicId,
            videoId,
            anonymousId: anonymousIdFromBrowser(),
          });
        });
      }}
    >
      {children}
    </Link>
  );
}

export function YouTubeOutbound({
  youtubeId,
  topicId,
  videoId,
}: {
  youtubeId: string;
  topicId: string;
  videoId: string;
}) {
  const [, startTransition] = useTransition();
  return (
    <a
      href={`https://www.youtube.com/watch?v=${youtubeId}`}
      target="_blank"
      rel="noreferrer"
      onClick={() => {
        startTransition(() => {
          void trackViewerEvent({
            eventName: "outbound_youtube_click",
            topicId,
            videoId,
            anonymousId: anonymousIdFromBrowser(),
          });
        });
      }}
    >
      Watch on YouTube
    </a>
  );
}
