"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function Messages() {
  const [students, setStudents] = useState<any[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [thread, setThread] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/instructor/students").then(setStudents).catch(() => setStudents([]));
  }, []);

  async function loadThread(studentId: string) {
    setSelected(studentId);
    setError(null);
    try {
      const data = await apiFetch(`/instructor/messages/${studentId}`);
      setThread(data.conversation ?? []);
    } catch (e: any) {
      setError(e.message);
      setThread([]);
    }
  }

  async function send() {
    if (!text.trim() || !selected) return;
    try {
      await apiFetch("/instructor/messages", { method: "POST", body: JSON.stringify({ student_id: selected, message_text: text }) });
      setText("");
      loadThread(selected);
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {students.map((s) => (
          <Button key={s.student_id} variant={selected === s.student_id ? "default" : "outline"} size="sm" onClick={() => loadThread(s.student_id)}>{s.name} ({s.student_id})</Button>
        ))}
        {students.length === 0 && <p className="text-sm text-muted-foreground">No linked students yet.</p>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {selected && (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
            {thread.length === 0 && <p className="text-sm text-muted-foreground">No messages yet.</p>}
            {thread.map((m) => (
              <div key={m.id} className="text-sm">
                <Badge variant="outline" className="mr-1">{m.from} → {m.to}</Badge>
                <span>{m.message_text}</span>
                <span className="ml-1 text-xs text-muted-foreground">{m.read_status ? "read" : "unread"}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message ${selected}…`} />
            <Button onClick={send}>Send</Button>
          </div>
        </div>
      )}
    </div>
  );
}
