"use client";

import ChatPanel, { ChatTurn } from "@/components/ChatPanel";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const EXERCISES = ["stall", "slow flight", "landing", "takeoff", "pattern work", "emergency procedures"];

export default function Technical() {
  const [active, setActive] = useState<string | null>(null);
  const [openTopic, setOpenTopic] = useState(false);

  async function send(message: string): Promise<ChatTurn> {
    const data = await apiFetch("/student/technical", { method: "POST", body: JSON.stringify({ message }) });
    return {
      role: "assistant",
      text: typeof data.response === "string" ? data.response : JSON.stringify(data.response, null, 2),
      notice: data.notice ?? null,
    };
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Buttons give the Technical Agent a specific exercise context; the open-topic box is for free-form theory questions scoped to technical topics.</p>
      <div className="flex flex-wrap gap-2">
        {EXERCISES.map((e) => (
          <Button key={e} variant={active === e ? "default" : "outline"} size="sm" onClick={() => { setActive(e); setOpenTopic(false); }}>{e}</Button>
        ))}
        <Button variant={openTopic ? "default" : "outline"} size="sm" onClick={() => { setOpenTopic(true); setActive(null); }}>Open topic</Button>
      </div>
      {active && <ChatPanel placeholder={`Ask about ${active}…`} onSend={send} initialMessage={`I want coaching on ${active}. Please give the theory, common student errors, a reference video, and a diagram description.`} />}
      {openTopic && <ChatPanel placeholder="Ask a theory question…" onSend={send} />}
      {!active && !openTopic && <p className="text-sm text-muted-foreground">Pick an exercise or Open topic to start.</p>}
    </div>
  );
}
