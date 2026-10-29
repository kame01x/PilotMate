"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LinkStudent({ onLinked }: { onLinked: () => void }) {
  const [studentId, setStudentId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [saving, setSaving] = useState(false);

  async function link() {
    setMessage(null);
    setIsError(false);
    const trimmed = studentId.trim();
    if (!trimmed) {
      setMessage("Enter a Student ID first.");
      setIsError(true);
      return;
    }
    setSaving(true);
    try {
      const data = await apiFetch("/instructor/link-student", { method: "POST", body: JSON.stringify({ student_id: trimmed }) });
      const list = Array.isArray(data.linked_students_now) ? data.linked_students_now : [];
      setMessage(data.already_linked ? "Student " + data.student + " is already linked to you." : "Linked student " + data.student + " - your students: " + list.join(", "));
      onLinked();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Link failed. Please try again.");
      setIsError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 max-w-md">
      <Label>Student ID (e.g. STU-0001)</Label>
      <div className="flex gap-2">
        <Input value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="STU-0001" />
        <Button onClick={link} disabled={saving}>Link</Button>
      </div>
      {message ? <p className={"text-sm " + (isError ? "text-destructive" : "text-success")}>{message}</p> : null}
    </div>
  );
}
