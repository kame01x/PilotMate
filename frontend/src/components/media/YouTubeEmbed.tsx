"use client";

/**
 * Shared YouTube player for every phase (Phase 21A).
 *
 * Reliability model — plain iframe FIRST, API upgrade second:
 *   1. A classic plain embed iframe renders immediately. It always loads the
 *      real player (poster, controls, play button) and is the permanent
 *      fallback if the IFrame API is blocked or slow.
 *   2. The IFrame API player is created inside a container DIV OWNED BY THIS
 *      EFFECT (never a React-managed node), so React and the YT API never
 *      fight over the same DOM position. Root cause of Phase 21's "frame but
 *      no video": YT.Player copies the container's className onto the iframe
 *      it creates — a `hidden` (display:none) container produced a
 *      permanently invisible player while React removed the working plain
 *      iframe, leaving an empty frame in every chat.
 *   3. When the API player is ready, its live iframe is normalised
 *      imperatively (visible, interactive) and React drops the plain iframe.
 *
 * States are distinguishable: loading (poster + status pill), ready (real
 * player), error (load failed/blocked → explanation + "Open on YouTube"
 * link), rejected (invalid ID → no embed). There is no fake play button —
 * the play control is always YouTube's own, inside the real player.
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
  getIframe?: () => HTMLIFrameElement | null;
}

interface YTApi {
  Player: new (el: HTMLElement | string, options: Record<string, unknown>) => YTPlayer;
  PlayerState?: { PLAYING: number; PAUSED: number; ENDED: number; BUFFERING: number };
}

const VALID_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const LOAD_TIMEOUT_MS = 12000;

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
  sourceUrl,
  className,
}: {
  videoId: string;
  title: string;
  /** Original URL — powers the always-available external fallback link. */
  sourceUrl?: string;
  className?: string;
}) {
  const { reportMediaPlaying, reportMediaStopped } = useMusic();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const loadedRef = useRef(false);
  // Keep the latest callbacks reachable from the mount-only effect below.
  const reportRef = useRef({ reportMediaPlaying, reportMediaStopped });
  useEffect(() => {
    reportRef.current = { reportMediaPlaying, reportMediaStopped };
  }, [reportMediaPlaying, reportMediaStopped]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  // True once the API player's live iframe replaces the plain fallback.
  const [apiLive, setApiLive] = useState(false);
  // Stable per-instance id (impure calls like Math.random are banned in render).
  const [mediaId] = useState(() => `yt-${videoId}-${counter++}`);

  const valid = VALID_ID_RE.test(videoId);

  // Reset player state when the video changes (render-phase adjustment —
  // lint-approved alternative to setState inside the effect body).
  const [prevKey, setPrevKey] = useState(`${videoId}:${String(valid)}`);
  const key = `${videoId}:${String(valid)}`;
  if (key !== prevKey) {
    setPrevKey(key);
    setStatus("loading");
    setApiLive(false);
  }

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    loadedRef.current = false;

    // The API container is created and owned by this effect — React only
    // owns the wrapper and the plain iframe, so there is no DOM hand-off.
    const container = document.createElement("div");
    container.className = "absolute inset-0 pointer-events-none";
    wrapRef.current?.appendChild(container);

    // Load watchdog: if neither the plain iframe nor the API player ever
    // becomes live, the video is blocked or unreachable — say so plainly.
    const watchdog = window.setTimeout(() => {
      if (!cancelled && !loadedRef.current) setStatus("error");
    }, LOAD_TIMEOUT_MS);

    loadYouTubeApi().then((yt) => {
      if (cancelled) return;
      if (!yt?.Player || !container.isConnected) return; // plain iframe keeps working
      const State = yt.PlayerState ?? { PLAYING: 1, PAUSED: 2, ENDED: 0, BUFFERING: 3 };
      try {
        playerRef.current = new yt.Player(container, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: { rel: 0, modestbranding: 1 },
          events: {
            onReady: () => {
              if (cancelled) return;
              // YT.Player copies our className onto its iframe — make the
              // live element explicitly visible and interactive (defensive:
              // never inherit a hiding class, whatever the container had).
              const iframe = playerRef.current?.getIframe?.();
              if (iframe) {
                iframe.classList.remove("hidden", "pointer-events-none");
                iframe.classList.add("absolute", "inset-0", "h-full", "w-full");
              }
              loadedRef.current = true;
              setStatus("ready");
              setApiLive(true);
            },
            onStateChange: (event: { data: number }) => {
              if (event.data === State.PLAYING || event.data === State.BUFFERING) {
                reportRef.current.reportMediaPlaying(mediaId);
              } else if (event.data === State.PAUSED || event.data === State.ENDED) {
                reportRef.current.reportMediaStopped(mediaId);
              }
            },
          },
        });
      } catch {
        /* API player failed — plain iframe fallback stays */
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
      reportRef.current.reportMediaStopped(mediaId); // never leak an interruption on unmount
      try {
        playerRef.current?.destroy(); // removes the API iframe
      } catch {
        /* player already gone */
      }
      playerRef.current = null;
      container.remove(); // no-op if YT already replaced it
    };
    // Re-create the player only when the video changes; the report callbacks
    // are stable context functions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, valid]);

  if (!valid) {
    return (
      <div
        className={`flex items-center gap-2 rounded-md border border-caution/40 bg-caution/10 px-3 py-2 text-xs text-caution ${className ?? ""}`}
      >
        <span>This video link is invalid and cannot be embedded.</span>
        {sourceUrl && (
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="font-medium underline">
            Open link
          </a>
        )}
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className={`relative aspect-video w-full overflow-hidden rounded-md border ${className ?? ""}`}
    >
      {/* Guaranteed-working base player; unmounted once the API player is live. */}
      {!apiLive && status !== "error" && (
        <iframe
          src={`https://www.youtube.com/embed/${videoId}`}
          title={title}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          onLoad={() => {
            loadedRef.current = true;
            setStatus((s) => (s === "error" ? s : "ready"));
          }}
          onError={() => setStatus("error")}
        />
      )}
      {/* Status pill — honest loading indicator over the real poster. */}
      {status === "loading" && (
        <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-background/85 px-2 py-0.5 text-[11px] text-muted-foreground">
          Loading video…
        </span>
      )}
      {/* Blocked/unreachable: plain explanation + working external link. */}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/50 p-4 text-center">
          <p className="text-xs leading-relaxed text-muted-foreground">
            The video couldn&apos;t load — it may be blocked on this network or unavailable.
          </p>
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              Open on YouTube
            </a>
          )}
        </div>
      )}
      {/* The API container (effect-owned div → YT iframe) lives here. */}
    </div>
  );
}
