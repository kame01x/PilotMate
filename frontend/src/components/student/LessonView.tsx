"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Exercise } from "./technicalData";

interface LessonSection {
  title: string;
  body: string;
  isWarning?: boolean;
}

interface Props {
  exercise: Exercise;
  lesson: string;
  loading: boolean;
}

function parseLesson(text: string): LessonSection[] {
  const lines = text.split("\n");
  const sections: LessonSection[] = [];
  let currentTitle = "";
  let currentBody: string[] = [];

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)/);
    const h3 = line.match(/^###\s+(.+)/);
    const heading = h2 || h3;
    if (heading) {
      if (currentTitle) {
        sections.push({ title: currentTitle, body: currentBody.join("\n").trim() });
      }
      currentTitle = heading[1].trim();
      currentBody = [];
    } else if (currentTitle) {
      currentBody.push(line);
    }
  }
  if (currentTitle) {
    sections.push({ title: currentTitle, body: currentBody.join("\n").trim() });
  }

  if (sections.length === 0) {
    return [{ title: "Lesson", body: text }];
  }

  for (const s of sections) {
    if (!s.body.trim()) {
      s.body = "Content unavailable — the agent could not generate this section.";
    }
  }
  return sections;
}

export default function LessonView({ exercise, lesson, loading }: Props) {
  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">Generating lesson for {exercise.name}…</p>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <svg viewBox="0 0 24 24" className="h-12 w-12 fill-none stroke-muted-foreground" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z M6 12v5c0 1.6 2.7 3 6 3s6-1.4 6-3v-5"/></svg>
        <p className="text-sm text-muted-foreground">Select an exercise from the sidebar to generate a lesson.</p>
      </div>
    );
  }

  const sections = parseLesson(lesson);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold">{exercise.name}</h2>
        {exercise.id.startsWith("custom-") && (
          <span className="rounded-md bg-secondary/10 px-2 py-0.5 text-xs text-secondary">Custom</span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{exercise.category}</p>

      {sections.map((section, i) => {
        const isVideo = /watch|video/i.test(section.title);
        const isCheck = /knowledge check|quiz|review/i.test(section.title);
        return (
          <Card key={i} className={section.isWarning ? "border-caution/40" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className={`flex items-center gap-2 text-base ${section.isWarning ? "text-caution" : ""}`}>
                {isVideo && (
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                )}
                {isCheck && (
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                )}
                {section.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed whitespace-pre-wrap">{section.body}</CardContent>
          </Card>
        );
      })}
    </div>
  );
}
