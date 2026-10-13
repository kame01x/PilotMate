"use client";

/**
 * Inline YouTube embed with playback events (Phase 19 media coordination).
 *
 * Uses the official YouTube IFrame Player API so play/pause/ended states are
 * reported to the music coordinator. If the API cannot load (offline, blocked),
 * falls back to a plain iframe with identical visuals and no events — the
 * existing embed behaviour — so video never breaks.
 */

import { useEffect, useRef, useState } from "react";
import { useMusic } from "@/lib/music/MusicContext";

declare global {
  interface Window {
    YT?: YTApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayer {
  destroy: () => void;
}

interface YTApi {
  Player: new (el: HTMLElement | string, options: Record<string, unknown>) => YTPlayer;
  PlayerState?: { PLAYING: number; PAUSED: number; ENDED: number; BUFFERING: number };
}

let apiPromise: Promise<YTApi | null> | null = null;
let counter = 0;

function loadYouTubeApi(): Promise<YTApi | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT ?? null);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => resolve(null); // degrade to plain iframe
    document.head.appendChild(script);
    // Safety timeout — never leave the embed hanging.
    setTimeout(() => resolve(window.YT ?? null), 8000);
  });
  return apiPromise;
}

export default function YouTubeEmbed({
  videoId,
  title,
  className,
}: {
  videoId: string;
  title: string;
  className?: string;
}) {
  const { reportMediaPlaying, reportMediaStopped } = useMusic();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  // Keep the latest callbacks reachable from the mount-only effect below.
  const reportRef = useRef({ reportMediaPlaying, reportMediaStopped });
  useEffect(() => {
    reportRef.current = { reportMediaPlaying, reportMediaStopped };
  }, [reportMediaPlaying, reportMediaStopped]);
  // null = API status unknown yet; "ready" = YT player mounted; "fallback" = plain iframe.
  const [mode, setMode] = useState<"pending" | "ready" | "fallback">("pending");
  // Stable per-instance id (impure calls like Math.random are banned in render).
  const [mediaId] = useState(() => `yt-${videoId}-${counter++}`);

  useEffect(() => {
    let cancelled = false;

    loadYouTubeApi().then((yt) => {
      if (cancelled) return;
      if (!yt?.Player || !containerRef.current) {
        setMode("fallback");
        return;
      }
      const State = yt.PlayerState ?? { PLAYING: 1, PAUSED: 2, ENDED: 0, BUFFERING: 3 };
      try {
        playerRef.current = new yt.Player(containerRef.current, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: { rel: 0, modestbranding: 1 },
          events: {
            onStateChange: (event: { data: number }) => {
              if (event.data === State.PLAYING || event.data === State.BUFFERING) {
                reportRef.current.reportMediaPlaying(mediaId);
              } else if (event.data === State.PAUSED || event.data === State.ENDED) {
                reportRef.current.reportMediaStopped(mediaId);
              }
            },
          },
        });
        setMode("ready");
      } catch {
        setMode("fallback");
      }
    });

    return () => {
      cancelled = true;
      reportRef.current.reportMediaStopped(mediaId); // never leak an interruption on unmount
      try {
        playerRef.current?.destroy();
      } catch {
        /* player already gone */
      }
      playerRef.current = null;
    };
    // Re-create the player only when the video changes; the report callbacks
    // are stable context functions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  return (
    <div className={`relative aspect-video w-full max-w-[420px] overflow-hidden rounded-md border ${className ?? ""}`}>
      {mode !== "ready" && (
        <iframe
          src={`https://www.youtube.com/embed/${videoId}`}
          title={title}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      )}
      {/* YT.Player replaces this div's contents once ready. */}
      <div ref={containerRef} className={mode === "ready" ? "h-full w-full" : "hidden"} />
    </div>
  );
}
