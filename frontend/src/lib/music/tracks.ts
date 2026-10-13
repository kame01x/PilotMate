export interface Track {
  id: string;
  title: string;
  src: string;
}

/** Royalty-free study tracks. Files live in frontend/public/audio/ (gitignored). */
export const TRACKS: Track[] = [
  { id: "lofi-study", title: "Lo-fi Study", src: "/audio/lofi-study.mp3" },
  { id: "ambient-focus", title: "Ambient Focus", src: "/audio/ambient-focus.mp3" },
  { id: "soft-acoustic", title: "Soft Acoustic", src: "/audio/soft-acoustic.mp3" },
  { id: "calm-piano", title: "Calm Piano", src: "/audio/calm-piano.mp3" },
];

export const DEFAULT_TRACK_ID = "lofi-study";

export function trackById(id: string): Track {
  return TRACKS.find((t) => t.id === id) ?? TRACKS.find((t) => t.id === DEFAULT_TRACK_ID) ?? TRACKS[0];
}
