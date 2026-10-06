"use client";

import ChatPanel, { ChatTurn } from "@/components/ChatPanel";
import { apiFetch } from "@/lib/api";

const CHOICES = [
  "pre-flight planning for a specific upcoming flight",
  "a technical/theory question about the maneuver itself",
  "a debrief of a flight I already flew",
  "the document library",
  "exam preparation",
];

export default function AskAnything() {
  async function send(message: string): Promise<ChatTurn> {
    const data = await apiFetch("/student/chat", { method: "POST", body: JSON.stringify({ message }) });
    const meta: Record<string, string> = {};
    if (data.intent) meta["Classified intent"] = String(data.intent);
    if (data.routed_to) meta["Routed to"] = String(data.routed_to);
    if (data.confidence) meta["Confidence"] = String(data.confidence);
    return {
      role: "assistant",
      text: typeof data.response === "string" ? data.response : JSON.stringify(data.response, null, 2),
      notice: data.notice ?? null,
      meta,
      choices: data.routed_to === "clarify" ? CHOICES : undefined,
    };
  }
  return <ChatPanel placeholder="Ask anything — I’ll route you to the right agent" onSend={send} />;
}
