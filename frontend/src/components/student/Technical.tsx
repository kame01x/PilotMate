"use client";

import { useEffect, useRef, useState } from "react";
import TechnicalSidebar from "./TechnicalSidebar";
import TechnicalChat from "./TechnicalChat";
import type { Exercise } from "./technicalData";

export default function Technical() {
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [customExercises, setCustomExercises] = useState<Exercise[]>([]);
  const chatKey = useRef(0);

  function selectExercise(exercise: Exercise) {
    setSelected((prev) => {
      if (prev?.id === exercise.id) return prev;
      chatKey.current++;
      return exercise;
    });
  }

  function addCustomExercise(name: string) {
    const ex: Exercise = { id: `custom-${Date.now()}`, name, category: "Custom" };
    setCustomExercises((prev) => {
      if (prev.some((e) => e.name.toLowerCase() === name.toLowerCase())) return prev;
      return [...prev, ex];
    });
    selectExercise(ex);
  }

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden gap-3">
      <TechnicalSidebar
        selected={selected}
        onSelect={selectExercise}
        customExercises={customExercises}
        onAddCustom={addCustomExercise}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TechnicalChat key={chatKey.current} exercise={selected} onCustomTopic={() => {}} />
      </div>
    </div>
  );
}
