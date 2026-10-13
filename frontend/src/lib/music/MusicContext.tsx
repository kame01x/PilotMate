"use client";

/**
 * Global background-music engine + media coordination (Phase 19).
 *
 * - One HTMLAudioElement for the whole app (mounted in the root layout).
 * - Preferences persist in localStorage (pilotmate_music_*), OFF by default.
 * - Media coordination: any tracked media (native audio/video via capture
 *   phase listeners, YouTube via YouTubeEmbed) pauses the music while it
 *   plays, and the music resumes only if the user has not since paused or
 *   disabled it themselves.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_TRACK_ID, trackById } from "@/lib/music/tracks";

const KEY_ENABLED = "pilotmate_music_enabled";
const KEY_TRACK = "pilotmate_music_track";
const KEY_VOLUME = "pilotmate_music_volume";
const DEFAULT_VOLUME = 0.5;

// localStorage is only readable in the browser, so prefs are applied AFTER
// hydration but BEFORE paint (layout effect) — the first client render
// intentionally matches the server's defaults, so hydration succeeds and the
// stored values replace them before the user sees a repaint. On the server
// this falls back to useEffect to avoid the SSR useLayoutEffect warning.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export type MusicStatus = "idle" | "loading" | "playing" | "paused" | "error";

interface MusicContextValue {
  enabled: boolean;
  status: MusicStatus;
  error: string | null;
  trackId: string;
  volume: number;
  /** User-initiated play. Also overrides any media interruption. */
  play: () => void;
  /** User-initiated pause. Cancels any pending resume-after-media. */
  pause: () => void;
  setTrack: (id: string) => void;
  setVolume: (v: number) => void;
  /** Media coordination — called by YouTubeEmbed and native media listeners. */
  reportMediaPlaying: (id: string) => void;
  reportMediaStopped: (id: string) => void;
}

const MusicContext = createContext<MusicContextValue | null>(null);

export function useMusic(): MusicContextValue {
  const ctx = useContext(MusicContext);
  if (!ctx) throw new Error("useMusic must be used within <MusicProvider>");
  return ctx;
}

function readStoredBool(key: string): boolean | null {
  try {
    const v = localStorage.getItem(key);
    return v === "true" ? true : v === "false" ? false : null;
  } catch {
    return null;
  }
}

function readStoredNumber(key: string): number | null {
  try {
    const v = localStorage.getItem(key);
    if (v == null || Number.isNaN(Number(v))) return null;
    return Number(v);
  } catch {
    return null;
  }
}

function readStoredString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function MusicProvider({ children }: { children: ReactNode }) {
  // Defaults on BOTH the server and the first client render, so hydration
  // matches; the layout effect below swaps in the stored prefs before paint.
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<MusicStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [trackId, setTrackIdState] = useState<string>(DEFAULT_TRACK_ID);
  const [volume, setVolumeState] = useState<number>(DEFAULT_VOLUME);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeMediaRef = useRef<Set<string>>(new Set());
  const resumeAfterMediaRef = useRef(false);
  const mediaIdsRef = useRef<WeakMap<HTMLMediaElement, string>>(new WeakMap());
  const mediaSeqRef = useRef(0);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    resumeAfterMediaRef.current = false; // explicit user intent wins over interruption
    setError(null);
    setEnabled(true);
    try {
      localStorage.setItem(KEY_ENABLED, "true");
    } catch { /* ignore */ }
    setStatus("loading");
    audio.play().catch((err: unknown) => {
      // Autoplay blocked or file missing — surface a usable paused state.
      setEnabled(false);
      try {
        localStorage.setItem(KEY_ENABLED, "false");
      } catch { /* ignore */ }
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setStatus("paused");
        setError("Browser blocked playback — press Play again to start.");
      } else {
        setStatus("error");
        setError("Track unavailable — add the MP3 to public/audio/ or pick another track.");
      }
    });
  }, []);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    resumeAfterMediaRef.current = false; // Scenario E: user paused — do not auto-resume
    setEnabled(false);
    try {
      localStorage.setItem(KEY_ENABLED, "false");
    } catch { /* ignore */ }
    if (audio) audio.pause();
    setStatus("paused");
  }, []);

  const setTrack = useCallback((id: string) => {
    const audio = audioRef.current;
    const track = trackById(id);
    setTrackIdState(track.id);
    try {
      localStorage.setItem(KEY_TRACK, track.id);
    } catch { /* ignore */ }
    if (!audio) return;
    const wasPlaying = !audio.paused && !audio.ended;
    audio.src = track.src;
    audio.load();
    if (wasPlaying) {
      // Keep playing the newly selected track.
      setStatus("loading");
      audio.play().catch(() => {
        setStatus("error");
        setError("Track unavailable — add the MP3 to public/audio/ or pick another track.");
      });
    }
    // Paused + switch: stay paused (do not unexpectedly start playback).
    setError(null);
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.min(1, Math.max(0, v));
    setVolumeState(clamped);
    if (audioRef.current) audioRef.current.volume = clamped;
    try {
      localStorage.setItem(KEY_VOLUME, String(clamped));
    } catch { /* ignore */ }
  }, []);

  const reportMediaPlaying = useCallback((id: string) => {
    const wasEmpty = activeMediaRef.current.size === 0;
    activeMediaRef.current.add(id);
    if (wasEmpty) {
      const audio = audioRef.current;
      if (enabled && audio && !audio.paused) {
        resumeAfterMediaRef.current = true; // remember to resume later
        audio.pause(); // status synced via the audio element's onPause handler
      }
    }
  }, [enabled]);

  const reportMediaStopped = useCallback((id: string) => {
    activeMediaRef.current.delete(id);
    if (activeMediaRef.current.size > 0) return; // Scenario D: other media still active
    if (!resumeAfterMediaRef.current) return;
    resumeAfterMediaRef.current = false;
    const audio = audioRef.current;
    if (audio && enabled) {
      audio.play().catch(() => {
        setStatus("paused");
        setError("Playback was blocked — press Play to resume.");
      });
    }
  }, [enabled]);

  // Apply stored prefs (pre-paint — see useIsomorphicLayoutEffect), sync the
  // audio element, attach playback handlers, and restore playback. Mount-only:
  // setTrack/setVolume maintain both sides afterwards.
  useIsomorphicLayoutEffect(() => {
    const storedTrackId = trackById(readStoredString(KEY_TRACK) ?? DEFAULT_TRACK_ID).id;
    const storedVolumeRaw = readStoredNumber(KEY_VOLUME);
    const storedVolume =
      storedVolumeRaw == null ? DEFAULT_VOLUME : Math.min(1, Math.max(0, storedVolumeRaw));
    setTrackIdState(storedTrackId);
    setVolumeState(storedVolume);

    const audio = audioRef.current;

    const onPlay = () => {
      setStatus("playing");
      setError(null);
    };
    const onPause = () => setStatus((s) => (s === "error" ? s : "paused"));
    const onWaiting = () => setStatus("loading");
    const onCanPlay = () => {
      if (audio && !audio.paused) setStatus("playing");
    };
    const onError = () => {
      setStatus("error");
      setError("Track unavailable — add the MP3 to public/audio/ or pick another track.");
    };

    if (audio) {
      audio.volume = storedVolume;
      audio.src = trackById(storedTrackId).src;
      audio.loop = true;

      audio.addEventListener("play", onPlay);
      audio.addEventListener("playing", onPlay);
      audio.addEventListener("pause", onPause);
      audio.addEventListener("waiting", onWaiting);
      audio.addEventListener("canplay", onCanPlay);
      audio.addEventListener("error", onError);

      // Restore "enabled" preference, respecting autoplay restrictions. Status
      // here is driven by the audio element's own events (waiting/canplay), so
      // no synchronous setState is needed before this async call.
      if (readStoredBool(KEY_ENABLED) === true) {
        audio.play().then(() => setEnabled(true)).catch(() => {
            // Autoplay blocked (or file missing) — ready-to-play state; the
            // stored preference is kept for the next visit; user can press Play.
            setEnabled(false);
            if (audio.error) {
              setStatus("error");
              setError("Track unavailable — add the MP3 to public/audio/ or pick another track.");
            } else {
              setStatus("paused");
            }
          });
      }
    }

    return () => {
      if (audio) {
        audio.removeEventListener("play", onPlay);
        audio.removeEventListener("playing", onPlay);
        audio.removeEventListener("pause", onPause);
        audio.removeEventListener("waiting", onWaiting);
        audio.removeEventListener("canplay", onCanPlay);
        audio.removeEventListener("error", onError);
        audio.pause();
      }
    };
    // Mount-only: sync the audio element once and manage it imperatively.
    // trackId/volume changes are applied by setTrack/setVolume directly.
  }, []);

  // Native <audio>/<video> coordination via capture-phase listeners —
  // media events don't bubble, but the capture phase still reaches window.
  useEffect(() => {
    const mediaId = (el: HTMLMediaElement): string => {
      let id = mediaIdsRef.current.get(el);
      if (!id) {
        mediaSeqRef.current += 1;
        id = `native-media-${mediaSeqRef.current}`;
        mediaIdsRef.current.set(el, id);
      }
      return id;
    };
    const onMedia = (e: Event) => {
      const target = e.target;
      if (!(target instanceof HTMLMediaElement)) return;
      if (target === audioRef.current) return; // never treat ourselves as "media"
      const id = mediaId(target);
      if (e.type === "play" || e.type === "playing") {
        reportMediaPlaying(id);
      } else if (e.type === "pause" || e.type === "ended") {
        reportMediaStopped(id);
      }
    };
    window.addEventListener("play", onMedia, true);
    window.addEventListener("playing", onMedia, true);
    window.addEventListener("pause", onMedia, true);
    window.addEventListener("ended", onMedia, true);
    return () => {
      window.removeEventListener("play", onMedia, true);
      window.removeEventListener("playing", onMedia, true);
      window.removeEventListener("pause", onMedia, true);
      window.removeEventListener("ended", onMedia, true);
    };
  }, [reportMediaPlaying, reportMediaStopped]);

  const value = useMemo<MusicContextValue>(
    () => ({
      enabled,
      status,
      error,
      trackId,
      volume,
      play,
      pause,
      setTrack,
      setVolume,
      reportMediaPlaying,
      reportMediaStopped,
    }),
    [enabled, status, error, trackId, volume, play, pause, setTrack, setVolume, reportMediaPlaying, reportMediaStopped]
  );

  return (
    <MusicContext.Provider value={value}>
      {children}
      {/* Single app-wide audio element — never duplicated across routes. */}
      <audio ref={audioRef} preload="none" className="hidden" aria-hidden="true" />
    </MusicContext.Provider>
  );
}
