export interface Track {
  id: string;
  title: string;
  src: string;
}

export const TRACKS: Track[] = [
  { id: "ambient-focus", title: "Ambient Focus", src: "https://res.cloudinary.com/h6rnryza/video/upload/v1793506700/ambient-focus.mp3" },
  { id: "calm-piano", title: "Calm Piano", src: "https://res.cloudinary.com/h6rnryza/video/upload/v1793507186/calm-piano.mp3" },
  { id: "lofi-study", title: "Lo-fi Study", src: "https://res.cloudinary.com/h6rnryza/video/upload/v1793538299/lofi-study.mp3" },
  { id: "soft-acoustic", title: "Soft Acoustic", src: "https://res.cloudinary.com/h6rnryza/video/upload/v1793506577/soft-acoustic.mp3" },
];

export const DEFAULT_TRACK_ID = "ambient-focus";

export function trackById(id: string): Track {
  return TRACKS.find((t) => t.id === id) ?? TRACKS.find((t) => t.id === DEFAULT_TRACK_ID) ?? TRACKS[0];
}
