"use client";

import { useEffect, useState } from "react";
import ChatPanel, { type ChatTurn } from "@/components/ChatPanel";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function ExamPrep({ selected }: { selected: string | null }) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    if (!selected) {
      setMessage(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setMessage(null);
    setError(null);
    apiFetch(`/exam-prep/sections/${encodeURIComponent(selected)}`)
      .then((data) => {
        if (!cancelled) setMessage(data.message);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  async function askQuestion(text: string): Promise<ChatTurn> {
    const data = await apiFetch("/student/chat", {
      method: "POST",
      body: JSON.stringify({ message: text }),
    });
    return {
      role: "assistant",
      text: typeof data.response === "string" ? data.response : JSON.stringify(data.response, null, 2),
      notice: data.notice ?? null,
    };
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <h1 className="text-2xl font-bold">Exams</h1>

      {!selected && (
        <p className="text-sm text-muted-foreground">
          Select an exam type from the list to see its status.
        </p>
      )}
      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {selected && message && (
        <Card>
          <CardContent className="py-4 text-sm">{message}</CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        <div>
          <Button variant="outline" size="sm" onClick={() => setShowChat(true)} disabled={showChat}>
            Ask a question
          </Button>
        </div>
        {showChat && (
          <ChatPanel placeholder="Ask a question about exams or aviation…" onSend={askQuestion} />
        )}
      </div>
    </div>
  );
}
