"use client";

import { useEffect, useRef } from "react";
import { useTransition } from "react";
import { trackViewerEvent } from "@/app/actions/viewer";
import { anonymousIdFromBrowser } from "@/components/anon-sync";

type YtPlayer = { destroy: () => void };

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string,
        options: {
          videoId: string;
          host?: string;
          width?: string;
          height?: string;
          playerVars?: Record<string, string | number>;
          events?: { onStateChange?: (event: { data: number }) => void };
        },
      ) => YtPlayer;
      PlayerState: { PLAYING: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | null = null;

function loadApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    document.body.appendChild(script);
  });
  return apiPromise;
}

export function YouTubePlayer({
  youtubeId,
  topicId,
  videoId,
}: {
  youtubeId: string;
  topicId: string;
  videoId: string;
}) {
  const played = useRef(false);
  const [, startTransition] = useTransition();
  const elementId = `player-${youtubeId}`;

  useEffect(() => {
    let player: YtPlayer | null = null;
    let cancelled = false;
    void loadApi().then(() => {
      if (cancelled || !window.YT) return;
      player = new window.YT.Player(elementId, {
        videoId: youtubeId,
        host: "https://www.youtube-nocookie.com",
        width: "100%",
        height: "100%",
        playerVars: {
          rel: 0,
          origin: window.location.origin,
          playsinline: 1,
        },
        events: {
          onStateChange(event) {
            if (played.current || !window.YT || event.data !== window.YT.PlayerState.PLAYING) return;
            played.current = true;
            startTransition(() => {
              void trackViewerEvent({
                eventName: "player_play",
                topicId,
                videoId,
                anonymousId: anonymousIdFromBrowser(),
              });
            });
          },
        },
      });
    });
    return () => {
      cancelled = true;
      player?.destroy();
    };
  }, [elementId, youtubeId, topicId, videoId, startTransition]);

  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-black" style={{ aspectRatio: "16 / 9" }}>
      <div id={elementId} className="absolute inset-0" />
    </div>
  );
}
