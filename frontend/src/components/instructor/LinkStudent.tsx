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

  async function link() {
    setMessage(null);
    setIsError(false);
    try {
      const data = await apiFetch("/instructor/link-student", { method: "POST", body: JSON.stringify({ student_id: studentId }) });
      setMessage(`Linked ${data.student} — your students: ${data.linked_students_now.join(", ")}`);
      onLinked();
    } catch (e: any) {
      setMessage(e.message);
      setIsError(true);
    }
  }

  return (
    <div className="flex flex-col gap-2 max-w-md">
      <Label>Student ID (e.g. STU-0001)</Label>
      <div className="flex gap-2">
        <Input value={studentId} onChange={(e) => setStudentId(e.target.value)} />
        <Button onClick={link}>Link</Button>
      </div>
      {message && <p className={`text-sm ${isError ? "text-red-600" : "text-green-700"}`}>{message}</p>}
    </div>
  );
}
