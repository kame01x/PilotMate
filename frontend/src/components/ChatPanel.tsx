"use client";

import { useEffect, useRef, useState } from "react";
import AnswerView from "@/components/answer/AnswerView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
  notice?: string | null;
  meta?: Record<string, string>;
  choices?: string[];
}

export { extractYouTubeId } from "@/components/AiBlocks";

export default function ChatPanel({
  placeholder,
  onSend,
  initialMessage,
}: {
  placeholder: string;
  onSend: (message: string) => Promise<ChatTurn>;
  initialMessage?: string;
}) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentInitial = useRef(false);

  useEffect(() => {
    if (initialMessage && !sentInitial.current) {
      sentInitial.current = true;
      send(initialMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    setError(null);
    setTurns((t) => [...t, { role: "user", text }]);
    setInput("");
    setLoading(true);
    try {
      const reply = await onSend(text);
      setTurns((t) => [...t, reply]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function choose(option: string) {
    send(option);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex max-h-96 flex-col gap-2 overflow-y-auto rounded-md border bg-card p-3">
        {turns.length === 0 && <p className="text-sm text-muted-foreground">{placeholder}</p>}
        {turns.map((turn, i) => (
          <div key={i} className={turn.role === "user" ? "self-end max-w-[85%]" : "w-[95%] max-w-[52rem] self-start"}>
            <div className={turn.role === "user" ? "rounded-md bg-primary px-3 py-2 text-primary-foreground" : "rounded-lg border border-border bg-card px-3 py-2.5 sm:px-4"}>
              {turn.meta && Object.entries(turn.meta).map(([k, v]) => (
                <Badge key={k} variant="outline" className="mr-1 mb-1">{k}: {v}</Badge>
              ))}
              {turn.role === "user" ? (
                <div className="whitespace-pre-wrap text-sm">{turn.text}</div>
              ) : (
                <AnswerView text={turn.text} />
              )}
              {turn.notice && (
                <div className="mt-2 rounded-sm border border-caution/40 bg-caution/10 px-2 py-1 text-xs text-caution">
                  ⚠ {turn.notice}
                </div>
              )}
              {turn.choices && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {turn.choices.map((c) => (
                    <Button key={c} size="sm" variant="outline" onClick={() => choose(c)}>{c}</Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && <p className="text-sm text-muted-foreground">Thinking…</p>}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(input)} placeholder={placeholder} />
        <Button onClick={() => send(input)} disabled={loading}>Send</Button>
      </div>
    </div>
  );
}
