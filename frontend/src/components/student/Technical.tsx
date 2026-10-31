"use client";
import { useEffect, useState } from "react";
import {
  ChevronDown,
  PlayCircle,
  Video,
  X,
} from "lucide-react";
import StudentPageHeader from "./StudentPageHeader";
import TechnicalSidebar from "./TechnicalSidebar";
import TechnicalChat from "./TechnicalChat";
import {
  VIDEO_CATALOGUE,
  VIDEO_PICKS,
  pickRandomVideo,
  type VideoPick,
} from "./videoCatalogue";
import { ALL_EXERCISES, type Exercise } from "./technicalData";
const TEXT = "#0f2a5c";
const MUTED = "#55698f";
const BORDER = "#d6e3f6";
const CARD = "rounded-2xl border bg-white/95 shadow-[0_2px_12px_rgba(31,80,170,0.08)]";
function videoForExercise(
  exerciseId: string,
  excludeVideoId: string | null,
): VideoPick | null {
  const exercise = VIDEO_CATALOGUE.find((item) => item.exerciseId === exerciseId);
  if (!exercise) return null;
  const candidates = exercise.videos.filter((video) => video.videoId !== excludeVideoId);
  const video = candidates[0] ?? exercise.videos[0];
  return {
    ...video,
    exerciseId: exercise.exerciseId,
    exerciseName: exercise.exerciseName,
    category: exercise.category,
  };
}
export default function Technical() {
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [customExercises, setCustomExercises] = useState<Exercise[]>([]);
  const [chatKey, setChatKey] = useState(0);
  const [videoExerciseId, setVideoExerciseId] = useState("");
  const [spotlight, setSpotlight] = useState<VideoPick | null>(VIDEO_PICKS[0]);
  useEffect(() => {
    if (!videoExerciseId && selected) {
      const next = videoForExercise(selected.id, spotlight?.videoId ?? null);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (next) setSpotlight(next);
    }
  }, [selected, videoExerciseId, spotlight?.videoId]);
  function chooseVideoExercise(value: string) {
    setVideoExerciseId(value);
    if (!value) {
      setSpotlight(pickRandomVideo(spotlight?.videoId ?? null));
      return;
    }
    const next = videoForExercise(value, spotlight?.videoId ?? null);
    setSpotlight(next);
  }
  function clearVideoExercise() {
    setVideoExerciseId("");
    setSpotlight(pickRandomVideo(spotlight?.videoId ?? null));
  }
  function selectExercise(exercise: Exercise) {
    if (selected?.id === exercise.id) return;
    setChatKey((current) => current + 1);
    setSelected(exercise);
  }
  function addCustomExercise(name: string) {
    const exercise: Exercise = { id: `custom-${Date.now()}`, name, category: "Custom" };
    setCustomExercises((current) => {
      if (current.some((item) => item.name.toLowerCase() === name.toLowerCase())) return current;
      return [...current, exercise];
    });
    selectExercise(exercise);
  }
  return (
    <div className="student-dashboard-surface mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-4">
      <StudentPageHeader
        title="Technical Training"
        subtitle="Learn, practice and master your aviation knowledge."
      />
      <div className="grid min-h-0 flex-1 gap-[18px] lg:grid-cols-[minmax(360px,1fr)_minmax(0,1.55fr)]">
        <TechnicalChat key={chatKey} exercise={selected} />

        <div className="grid min-h-0 gap-[18px] lg:grid-rows-[auto_minmax(0,1fr)]">
          <TechnicalSidebar
            selected={selected}
            onSelect={selectExercise}
            customExercises={customExercises}
            onAddCustom={addCustomExercise}
          />

          <section
            className={`flex min-h-0 flex-col gap-4 p-5 ${CARD}`}
            style={{ borderColor: BORDER }}
            aria-label="Training Video Spotlight"
          >
            <div className="flex flex-wrap items-center gap-3">
              <Video className="h-6 w-6 shrink-0 text-[#1f6bf5]" aria-hidden="true" />
              <h2 className="text-[17px] font-bold" style={{ color: TEXT }}>
                Training Video Spotlight
              </h2>
              <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
                <div className="relative min-w-0 flex-1 sm:flex-none">
                  <select
                    value={videoExerciseId}
                    onChange={(event) => chooseVideoExercise(event.target.value)}
                    aria-label="Choose an exercise for the training video"
                    className="h-10 w-full appearance-none rounded-[10px] border bg-white px-3.5 pr-9 text-[13px] outline-none transition focus:border-[#1f6bf5] sm:min-w-[200px]"
                    style={{ borderColor: "#c9d9f1", color: TEXT }}
                  >
                    <option value="">Recommended for you</option>
                    {ALL_EXERCISES.map((exercise) => (
                      <option key={exercise.id} value={exercise.id}>
                        {exercise.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#55698f]"
                    aria-hidden="true"
                  />
                </div>
                {videoExerciseId && (
                  <button
                    type="button"
                    onClick={clearVideoExercise}
                    className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-[#55698f] transition hover:bg-[#f2f7ff] hover:text-[#0f2a5c]"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                    Clear
                  </button>
                )}
              </div>
            </div>

            {spotlight ? (
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <h3 className="text-[17px] font-bold leading-snug" style={{ color: TEXT }}>
                  {spotlight.exerciseName}
                </h3>
                <a
                  href={spotlight.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group block"
                >
                  <div
                    className="relative aspect-video w-full overflow-hidden rounded-xl border bg-[#dce9fb]"
                    style={{ borderColor: BORDER }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={spotlight.thumbnailUrl}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-[#071f55]/15">
                      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-[#1f6bf5] shadow-sm">
                        <PlayCircle className="h-6 w-6" aria-hidden="true" />
                      </span>
                    </span>
                  </div>
                </a>
                <div className="flex flex-col gap-1">
                  <p className="text-[13px] font-semibold text-[#1857cf]">{spotlight.title}</p>
                  <p className="text-[12px]" style={{ color: MUTED }}>{spotlight.channel}</p>
                  <p className="text-[13px] leading-relaxed" style={{ color: "#3f5580" }}>
                    {spotlight.description}
                  </p>
                </div>
              </div>
            ) : (
              <div
                className="flex min-h-0 flex-1 items-center justify-center rounded-xl border bg-[#f7faff] p-4"
                style={{ borderColor: "#e1eaf8" }}
              >
                <p className="text-sm text-center" style={{ color: MUTED }}>No verified training video is available for this subject.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
