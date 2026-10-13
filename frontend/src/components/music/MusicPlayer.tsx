"use client";

/**
 * Compact background-music controls (Phase 19). Rendered in the existing
 * ThemeToggle control areas — same outline-button styling, no floating widget.
 */

import { PauseIcon, PlayIcon, Volume2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMusic } from "@/lib/music/MusicContext";
import { TRACKS } from "@/lib/music/tracks";

export default function MusicPlayer() {
  const { enabled, status, error, trackId, volume, play, pause, setTrack, setVolume } = useMusic();
  const isPlaying = status === "playing";
  const isLoading = status === "loading" && enabled;

  return (
    <div className="flex flex-col gap-1.5" aria-label="Background music player">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => (isPlaying || enabled ? pause() : play())}
          disabled={isLoading}
          aria-label={isPlaying ? "Pause background music" : "Play background music"}
          aria-pressed={isPlaying}
          title={isPlaying ? "Pause background music" : "Play background music"}
          className="px-2"
        >
          {isPlaying ? (
            <PauseIcon className="h-4 w-4" aria-hidden="true" />
          ) : (
            <PlayIcon className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <Volume2Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label="Background music volume"
            title={`Volume ${Math.round(volume * 100)}%`}
            className="h-1 min-w-0 flex-1 cursor-pointer accent-current"
          />
        </div>
      </div>
      <Select
        value={trackId}
        onValueChange={(v) => v && setTrack(v)}
        items={TRACKS.map((track) => ({ value: track.id, label: track.title }))}
      >
        <SelectTrigger size="sm" className="w-full" aria-label="Background music track" title="Select a background music track">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TRACKS.map((track) => (
            <SelectItem key={track.id} value={track.id}>
              {track.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <p role="status" className="text-[11px] leading-tight text-destructive">
          {error}
        </p>
      )}
      {isPlaying && !error && (
        <p className="text-[11px] leading-tight text-muted-foreground" aria-hidden="true">
          Playing — pauses during videos
        </p>
      )}
    </div>
  );
}
