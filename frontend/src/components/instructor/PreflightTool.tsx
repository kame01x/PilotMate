"use client";

import { useEffect, useState } from "react";
import ChatPanel, { ChatTurn } from "@/components/ChatPanel";
import { apiFetch } from "@/lib/api";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function PreflightTool() {
  const [students, setStudents] = useState<any[]>([]);
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    apiFetch("/instructor/students").then(setStudents).catch(() => setStudents([]));
  }, []);

  async function send(message: string): Promise<ChatTurn> {
    const data = await apiFetch("/instructor/preflight", {
      method: "POST",
      body: JSON.stringify({ student_id: selected, message }),
    });
    return {
      role: "assistant",
      text: typeof data.response === "string" ? data.response : JSON.stringify(data.response, null, 2),
      notice: data.notice ?? null,
    };
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-sm">
        <Label>Linked student</Label>
        <Select value={selected} onValueChange={(v) => setSelected(v ?? "")}>
          <SelectTrigger><SelectValue placeholder="Select a linked student" /></SelectTrigger>
          <SelectContent>
            {students.map((s) => (
              <SelectItem key={s.student_id} value={s.student_id}>{s.name} ({s.student_id})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {selected ? (
        <ChatPanel placeholder={`Run the pre-flight agent for ${selected}…`} onSend={send} />
      ) : (
        <p className="text-sm text-muted-foreground">Select a linked student to run the pre-flight agent for them.</p>
      )}
    </div>
  );
}
