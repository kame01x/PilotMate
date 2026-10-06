"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
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

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)]+)/g;

export function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/|youtube\.com\/v\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}

function RichText({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  LINK_RE.lastIndex = 0;
  while ((match = LINK_RE.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const label = match[1] ?? match[3];
    const url = match[2] ?? match[3];
    const id = extractYouTubeId(url);
    if (id) {
      nodes.push(label !== url ? <span key={i++}>{label} — </span> : null);
      nodes.push(
        <iframe
          key={i++}
          src={`https://www.youtube.com/embed/${id}`}
          title={label}
          className="my-2 aspect-video w-full max-w-[420px] rounded-md border"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      );
    } else {
      nodes.push(
        <a key={i++} href={url} target="_blank" rel="noreferrer" className="text-blue-600 underline break-all">
          {label}
        </a>
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <div className="whitespace-pre-wrap text-sm">{nodes}</div>;
}

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
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function choose(option: string) {
    send(option);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex max-h-96 flex-col gap-2 overflow-y-auto rounded-md border p-3">
        {turns.length === 0 && <p className="text-sm text-muted-foreground">{placeholder}</p>}
        {turns.map((turn, i) => (
          <div key={i} className={turn.role === "user" ? "self-end max-w-[85%]" : "self-start max-w-[85%]"}>
            <div className={turn.role === "user" ? "rounded-md bg-primary px-3 py-2 text-primary-foreground" : "rounded-md bg-muted px-3 py-2"}>
              {turn.meta && Object.entries(turn.meta).map(([k, v]) => (
                <Badge key={k} variant="outline" className="mr-1 mb-1">{k}: {v}</Badge>
              ))}
              <RichText text={turn.text} />
              {turn.notice && (
                <div className="mt-2 rounded-sm border border-amber-400 bg-amber-50 px-2 py-1 text-xs text-amber-900">
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
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(input)} placeholder={placeholder} />
        <Button onClick={() => send(input)} disabled={loading}>Send</Button>
      </div>
    </div>
  );
}
