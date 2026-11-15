"use client";

import { useEffect, useRef } from "react";
import { useTransition } from "react";
import { trackViewerEvent } from "@/app/actions/viewer";
import { anonymousIdFromBrowser } from "@/components/anon-sync";

const recent = new Map<string, number>();

export function TrackEvent({
  eventName,
  topicId,
  videoId,
}: {
  eventName: string;
  topicId?: string | null;
  videoId?: string | null;
}) {
  const started = useRef(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const key = `${eventName}:${topicId ?? ""}:${videoId ?? ""}`;
    const now = Date.now();
    if (started.current || now - (recent.get(key) ?? 0) < 1500) return;
    started.current = true;
    recent.set(key, now);
    startTransition(() => {
      void trackViewerEvent({
        eventName,
        topicId,
        videoId,
        anonymousId: anonymousIdFromBrowser(),
      });
    });
  }, [eventName, topicId, videoId, startTransition]);

  return null;
}
