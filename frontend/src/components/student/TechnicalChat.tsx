"use client";

import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AnswerView from "@/components/answer/AnswerView";
import type { Exercise } from "./technicalData";

interface ChatTurn {
  role: "user" | "assistant";
  text: string;
  notice?: string | null;
}

interface Props {
  exercise: Exercise | null;
  onCustomTopic: (topic: string) => void;
}

export default function TechnicalChat({ exercise, onCustomTopic }: Props) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const exerciseRef = useRef<Exercise | null>(null);

  async function send(text: string, displayUser = true) {
    if (!text.trim() || loading) return;
    setError(null);
    if (displayUser) {
      setTurns((t) => [...t, { role: "user", text }]);
    }
    setInput("");
    setLoading(true);
    try {
      const context = exerciseRef.current
        ? `Current exercise: ${exerciseRef.current.name} (${exerciseRef.current.category}). `
        : "";
      const data = await apiFetch("/student/technical", {
        method: "POST",
        body: JSON.stringify({ message: context + text }),
      });
      const responseText = typeof data.response === "string" ? data.response : JSON.stringify(data.response, null, 2);
      if (!responseText.trim()) {
        throw new Error("The agent returned an empty response. Please try again.");
      }
      setTurns((t) => [...t, { role: "assistant", text: responseText, notice: data.notice ?? null }]);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleExerciseChange(ex: Exercise | null) {
    if (!ex) {
      exerciseRef.current = null;
      setTurns([]);
      setError(null);
      return;
    }
    if (ex.id === exerciseRef.current?.id) return;
    exerciseRef.current = ex;
    setTurns([]);
    setError(null);
    const contextMsg = `I'm starting an exercise-type technical session for: ${ex.name} (${ex.category}). Give me the theory, common student errors, a reference video, and a diagram description.`;
    await send(contextMsg, false);
  }

  function handleCustomTopic() {
    const topic = customTopic.trim();
    if (!topic || loading) return;
    setCustomTopic("");
    exerciseRef.current = null;
    setTurns([]);
    setError(null);
    onCustomTopic(topic);
    send(topic, true);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">
          {exercise ? exercise.name : "General Technical"}
        </p>
        {loading && <p className="text-xs text-muted-foreground">Generating…</p>}
      </div>

      <div className="flex gap-2">
        <Input
          value={customTopic}
          onChange={(e) => setCustomTopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleCustomTopic();
            }
          }}
          placeholder="Ask about something else…"
          className="h-9"
        />
        <Button variant="outline" size="sm" onClick={handleCustomTopic} disabled={loading || !customTopic.trim()}>
          Ask
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto rounded-md border bg-card p-3">
        {turns.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">
            {exercise
              ? `Ask a question about ${exercise.name} or any aviation theory topic.`
              : "Select an exercise from the list or type a question above."}
          </p>
        )}
        {turns.map((turn, i) => (
          <div key={i} className={turn.role === "user" ? "self-end max-w-[85%]" : "self-start max-w-[85%]"}>
            <div className={turn.role === "user" ? "rounded-md bg-primary px-3 py-2 text-primary-foreground" : "rounded-lg border border-border bg-background px-3 py-2.5"}>
              {turn.role === "user" ? (
                <div className="text-sm leading-relaxed whitespace-pre-wrap">{turn.text}</div>
              ) : (
                <AnswerView text={turn.text} />
              )}
              {turn.notice && (
                <div className="mt-2 rounded-sm border border-caution/40 bg-caution/10 px-2 py-1 text-xs text-caution">
                  {turn.notice}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="self-start">
            <div className="rounded-md border border-border bg-background px-3 py-2">
              <p className="text-sm text-muted-foreground">Generating…</p>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input, true);
            }
          }}
          placeholder="Ask a follow-up…"
        />
        <Button onClick={() => send(input, true)} disabled={loading || !input.trim()}>
          Send
        </Button>
      </div>
    </div>
  );
}
