"use client";

import { useEffect, useState } from "react";
import ChatPanel, { ChatTurn } from "@/components/ChatPanel";
import { apiFetch } from "@/lib/api";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Debrief() {
  const [flights, setFlights] = useState<any[]>([]);
  const [flightId, setFlightId] = useState<string>("");
  const [saved, setSaved] = useState<any | null>(null);

  useEffect(() => {
    apiFetch("/student/flights").then(setFlights).catch(() => setFlights([]));
  }, []);

  async function send(message: string): Promise<ChatTurn> {
    const data = await apiFetch("/student/debrief", {
      method: "POST",
      body: JSON.stringify({ message, flight_id: flightId ? Number(flightId) : null }),
    });
    if (flightId) {
      try {
        const record = await apiFetch(`/student/debriefs/${flightId}`);
        setSaved(record);
      } catch {
        setSaved(null);
      }
    }
    return {
      role: "assistant",
      text: typeof data.response === "string" ? data.response : JSON.stringify(data.response, null, 2),
      notice: data.notice ?? null,
    };
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-sm">
        <Label>Flight to debrief</Label>
        <Select value={flightId} onValueChange={(v) => setFlightId(v ?? "")}>
          <SelectTrigger><SelectValue placeholder="Select a past flight" /></SelectTrigger>
          <SelectContent>
            {flights.map((f) => (
              <SelectItem key={f.id} value={String(f.id)}>
                {f.flight_id} — {f.exercise_type} — {f.date?.slice(0, 10)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {saved && (
        <Card className="border-amber-300">
          <CardHeader><CardTitle className="text-base">Identified weak points — DRAFT (pending instructor review, not a final verdict)</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-2 text-xs text-amber-800">{saved.identified_weak_points?.status}</p>
            <ul className="list-disc pl-5 text-sm">
              {(saved.identified_weak_points?.items ?? []).map((it: string, i: number) => (<li key={i}>{it}</li>))}
            </ul>
            {saved.coaching_notes && (
              <>
                <h4 className="mt-3 font-medium">Coaching notes</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{saved.coaching_notes}</p>
              </>
            )}
          </CardContent>
        </Card>
      )}
      <ChatPanel placeholder="Tell me how the flight went…" onSend={send} />
    </div>
  );
}
