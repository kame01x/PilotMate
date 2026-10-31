"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { apiFetch } from "@/lib/api";
import AnswerView from "@/components/answer/AnswerView";
import type { Exercise } from "./technicalData";

interface ChatTurn {
  role: "user" | "assistant";
  text: string;
  notice?: string | null;
}

interface Props {
  exercise: Exercise | null;
}

const TEXT = "#0f2a5c";
const MUTED = "#55698f";
const BORDER = "#d6e3f6";
const QUICK_PROMPTS = [
  "How to handle crosswind?",
  "Landing checklist",
  "Instrument approach",
  "Emergency procedures",
];

export default function TechnicalChat({ exercise }: Props) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [turns, loading]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || loading) return;

    setError(null);
    setTurns((current) => [...current, { role: "user", text: message }]);
    setInput("");
    setLoading(true);

    try {
      const context = exercise
        ? `Current exercise: ${exercise.name} (${exercise.category}). `
        : "";
      const data = await apiFetch("/student/technical", {
        method: "POST",
        body: JSON.stringify({ message: context + message }),
      });
      const responseText =
        typeof data.response === "string" ? data.response : JSON.stringify(data.response, null, 2);
      if (!responseText.trim()) {
        throw new Error("The agent returned an empty response. Please try again.");
      }
      setTurns((current) => [
        ...current,
        { role: "assistant", text: responseText, notice: data.notice ?? null },
      ]);
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const intro = exercise
    ? `You're studying ${exercise.name}. Ask me about the technique, the checklist or common mistakes. I will answer using the exercise you have open.`
    : "Pick an exercise from the library, then ask me about the technique, the checklist or common mistakes. I will answer using the exercise you have open.";

  return (
    <section
      className="flex min-h-[520px] flex-col gap-4 rounded-2xl border bg-white/95 p-5 shadow-[0_2px_12px_rgba(31,80,170,0.08)] lg:min-h-0"
      style={{ borderColor: BORDER }}
      aria-label="Ask Anything"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-[#e3eeff] text-[#1f6bf5]">
          <MessageSquare className="h-[22px] w-[22px]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold" style={{ color: TEXT }}>Ask Anything</h2>
          <p className="mt-0.5 text-[13px]" style={{ color: MUTED }}>
            Ask about techniques, procedures or any aviation topic.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {QUICK_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => void send(prompt)}
            disabled={loading}
            className="rounded-full bg-[#e8f0fd] px-3.5 py-2 text-[13px] font-medium text-[#17305f] transition hover:bg-[#dbe8fd] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {prompt}
          </button>
        ))}
      </div>

      <div
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-xl border bg-[#f7faff] p-4"
        style={{ borderColor: "#e1eaf8" }}
        aria-live="polite"
      >
        <div className="max-w-[92%] self-start rounded-2xl rounded-bl-[4px] border bg-white px-4 py-3 text-[14px] leading-relaxed" style={{ borderColor: BORDER, color: TEXT }}>
          {intro}
        </div>

        {turns.map((turn, index) => (
          <div
            key={index}
            className={turn.role === "user" ? "max-w-[84%] self-end" : "max-w-[92%] self-start"}
          >
            <div
              className={
                turn.role === "user"
                  ? "rounded-2xl rounded-br-[4px] bg-[#1f6bf5] px-4 py-3 text-[14px] leading-relaxed text-white"
                  : "rounded-2xl rounded-bl-[4px] border bg-white px-4 py-3"
              }
              style={turn.role === "assistant" ? { borderColor: BORDER } : undefined}
            >
              {turn.role === "user" ? (
                <p className="whitespace-pre-wrap">{turn.text}</p>
              ) : (
                <AnswerView text={turn.text} />
              )}
              {turn.notice && (
                <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-800">
                  {turn.notice}
                </p>
              )}
            </div>
          </div>
        ))}

        {loading && <p className="text-xs" style={{ color: MUTED }}>Preparing your answer...</p>}
        <div ref={bottomRef} />
      </div>

      {error && <p role="alert" className="px-1 text-xs text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center gap-1.5">
        {exercise && (
          <span
            className="max-w-full truncate rounded-full bg-[#e8f0fd] px-2.5 py-1 text-[10px] font-semibold text-[#1857cf]"
            title={exercise.name}
          >
            Focus: {exercise.name}
          </span>
        )}
      </div>

      <div className="flex gap-2.5">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(input);
            }
          }}
          placeholder={
            exercise
              ? `Ask about ${exercise.name.toLowerCase()}...`
              : "Ask about flare, crosswind, stalls..."
          }
          aria-label="Ask a technical question"
          disabled={loading}
          className="h-12 min-w-0 flex-1 rounded-xl border bg-white px-4 text-[14px] outline-none transition placeholder:text-[#667a9e] focus:border-[#1f6bf5] disabled:opacity-60"
          style={{ borderColor: "#c9d9f1", color: TEXT }}
        />
        <button
          type="button"
          onClick={() => void send(input)}
          disabled={loading || !input.trim()}
          aria-label="Send question"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#1f6bf5] text-white transition hover:bg-[#155bd8] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-[18px] w-[18px]" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
