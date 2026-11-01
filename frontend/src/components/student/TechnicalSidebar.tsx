"use client";

import { useState } from "react";
import { BookOpen, Plus, Search } from "lucide-react";
import { TECHNICAL_CATEGORIES, type Exercise } from "./technicalData";

const TEXT = "#0f2a5c";
const MUTED = "#55698f";
const BORDER = "#d6e3f6";
const TOPIC_LABELS: Record<string, string> = {
  "aircraft-fundamentals": "Fundamentals",
  "aircraft-systems": "Systems",
  performance: "Performance",
  meteorology: "Meteorology",
  navigation: "Navigation",
  "air-law": "Air Law",
  "abnormal-emergency": "Emergency",
  "human-performance": "Human Factors",
};

interface Props {
  selected: Exercise | null;
  onSelect: (exercise: Exercise) => void;
  customExercises: Exercise[];
  onAddCustom: (name: string) => void;
}

export default function TechnicalSidebar({ selected, onSelect, customExercises, onAddCustom }: Props) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const [customInput, setCustomInput] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const query = search.toLowerCase().trim();
  const totalExercises = TECHNICAL_CATEGORIES.reduce((total, category) => total + category.exercises.length, 0);

  function addCustom() {
    const name = customInput.trim();
    if (!name) return;
    const exists = [...TECHNICAL_CATEGORIES.flatMap((category) => category.exercises), ...customExercises].some(
      (exercise) => exercise.name.toLowerCase() === name.toLowerCase(),
    );
    if (exists) return;
    onAddCustom(name);
    setCustomInput("");
  }

  const category = TECHNICAL_CATEGORIES.find((item) => item.id === activeCategory);
  const visibleExercises = query
    ? TECHNICAL_CATEGORIES.flatMap((item) =>
        item.exercises.filter(
          (exercise) =>
            exercise.name.toLowerCase().includes(query) ||
            item.name.toLowerCase().includes(query),
        ),
      )
    : category?.exercises ?? [];
  const visibleCustom = customExercises.filter(
    (exercise) => !query || exercise.name.toLowerCase().includes(query),
  );
  const hasResults = visibleExercises.length > 0 || visibleCustom.length > 0;

  return (
    <section
      className="flex flex-col rounded-2xl border bg-white/95 p-[18px] shadow-[0_2px_12px_rgba(31,80,170,0.08)]"
      style={{ borderColor: BORDER }}
      aria-label="Exercises Library"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-[#e3eeff] text-[#1f6bf5]">
          <BookOpen className="h-[22px] w-[22px]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold" style={{ color: TEXT }}>Exercises Library</h2>
          <p className="mt-0.5 text-[13px]" style={{ color: MUTED }}>
            Choose a topic for your next question.
          </p>
        </div>
        <span className="ml-auto rounded-full bg-[#e3eeff] px-3 py-1 text-[12px] font-bold text-[#1857cf]">
          {totalExercises}
        </span>
        <button
          type="button"
          onClick={() => setShowCustom((current) => !current)}
          aria-label={showCustom ? "Hide custom exercise field" : "Add a custom exercise"}
          aria-expanded={showCustom}
          title={showCustom ? "Hide custom exercise field" : "Add a custom exercise"}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition ${
            showCustom
              ? "border-[#1f6bf5] bg-[#1f6bf5] text-white"
              : "border-[#c9d9f1] bg-white text-[#1857cf] hover:bg-[#f2f7ff]"
          }`}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="relative mt-3.5">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[#55698f]"
          aria-hidden="true"
        />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search exercises..."
          aria-label="Search exercises"
          className="h-11 w-full rounded-[10px] border bg-[#f7faff] pl-10 pr-3.5 text-[14px] outline-none transition focus:border-[#1f6bf5]"
          style={{ borderColor: "#c9d9f1", color: TEXT }}
        />
      </div>

      <div className="mt-3 flex flex-nowrap gap-2 overflow-x-auto pb-1">
        {TECHNICAL_CATEGORIES.map((item) => {
          const active = !query && item.id === activeCategory;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveCategory((current) => (current === item.id ? "" : item.id))}
              aria-pressed={active}
              className={`shrink-0 rounded-full border px-3.5 py-[7px] text-[13px] font-medium transition ${
                active
                  ? "border-[#1f6bf5] bg-[#1f6bf5] text-white"
                  : "border-[#c9d9f1] bg-white text-[#0f2a5c] hover:border-[#1f6bf5] hover:bg-[#f2f7ff]"
              }`}
            >
              {TOPIC_LABELS[item.id] ?? item.name}
            </button>
          );
        })}
      </div>

      {(query || activeCategory || customExercises.length > 0) && (
        <div className="mt-2 max-h-[104px] overflow-y-auto pr-1">
          {hasResults ? (
            <div className="flex flex-wrap gap-1.5">
              {visibleExercises.map((exercise) => {
                const active = selected?.id === exercise.id;
                return (
                  <button
                    key={exercise.id}
                    type="button"
                    onClick={() => onSelect(exercise)}
                    className={`flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-[12px] font-medium transition ${
                      active
                        ? "border-[#1f6bf5] bg-[#dbe8fd] text-[#0f2a5c]"
                        : "border-[#e1eaf8] bg-[#f8fbff] text-[#17305f] hover:border-[#bcd4f5] hover:bg-[#f2f7ff]"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-3 w-3 shrink-0 items-center justify-center rounded-full border-2 ${
                        active ? "border-[#1f6bf5]" : "border-[#9db3d8]"
                      }`}
                    >
                      {active && <span className="h-1 w-1 rounded-full bg-[#1f6bf5]" />}
                    </span>
                    <span className="min-w-0 truncate">{exercise.name}</span>
                  </button>
                );
              })}
              {visibleCustom.map((exercise) => {
                const active = selected?.id === exercise.id;
                return (
                  <button
                    key={exercise.id}
                    type="button"
                    onClick={() => onSelect(exercise)}
                    className={`flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-[12px] font-medium transition ${
                      active
                        ? "border-[#1f6bf5] bg-[#dbe8fd] text-[#0f2a5c]"
                        : "border-[#e1eaf8] bg-[#f8fbff] text-[#17305f] hover:border-[#bcd4f5] hover:bg-[#f2f7ff]"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-3 w-3 shrink-0 items-center justify-center rounded-full border-2 ${
                        active ? "border-[#1f6bf5]" : "border-[#9db3d8]"
                      }`}
                    >
                      {active && <span className="h-1 w-1 rounded-full bg-[#1f6bf5]" />}
                    </span>
                    <span className="min-w-0 truncate">{exercise.name}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="py-1 text-[12px]" style={{ color: MUTED }}>
              {query ? "No exercises match that search." : "Select a topic to browse its exercises."}
            </p>
          )}
        </div>
      )}

      {showCustom && (
        <div className="mt-3 flex gap-2 border-t pt-3" style={{ borderColor: "#eaf0fa", maxHeight: "200px", overflow: "hidden" }}>
          <label htmlFor="custom-exercise" className="sr-only">
            Add a custom exercise
          </label>
          <input
            id="custom-exercise"
            value={customInput}
            onChange={(event) => setCustomInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") addCustom();
            }}
            placeholder="Add a custom exercise..."
            className="h-9 min-w-0 flex-1 rounded-lg border bg-[#f7faff] px-3 text-[12px] outline-none transition focus:border-[#1f6bf5]"
            style={{ borderColor: "#c9d9f1", color: TEXT }}
          />
          <button
            type="button"
            onClick={addCustom}
            disabled={!customInput.trim()}
            aria-label="Add custom exercise"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#1f6bf5] text-white transition hover:bg-[#155bd8] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}
