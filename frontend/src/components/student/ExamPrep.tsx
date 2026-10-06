"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const SECTIONS = ["PPL", "ATPL", "Know Your Aircraft"];

export default function ExamPrep() {
  const [message, setMessage] = useState<string | null>(null);

  async function open(name: string) {
    try {
      const data = await apiFetch(`/exam-prep/sections/${encodeURIComponent(name)}`);
      setMessage(data.message);
    } catch (e: any) {
      setMessage(e.message);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {SECTIONS.map((s) => <Button key={s} variant="outline" onClick={() => open(s)}>{s}</Button>)}
      </div>
      {message && <Card><CardContent className="py-4 text-sm">{message}</CardContent></Card>}
    </div>
  );
}
