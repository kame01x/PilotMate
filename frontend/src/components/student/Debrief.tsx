"use client";

import { useEffect, useState } from "react";
import ChatPanel, { ChatTurn } from "@/components/ChatPanel";
import AnswerView from "@/components/answer/AnswerView";
import { apiFetch } from "@/lib/api";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Debrief() {
  const [flights, setFlights] = useState<any[]>([]);
  const [flightError, setFlightError] = useState<string | null>(null);
  const [loadingFlights, setLoadingFlights] = useState(true);
  const [flightId, setFlightId] = useState<string>("");
  const [saved, setSaved] = useState<any | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/student/flights")
      .then((data) => {
        if (cancelled) return;
        setFlights(data);
        setLoadingFlights(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setFlightError(e.message);
        setLoadingFlights(false);
      });
    return () => {
      cancelled = true;
    };
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
    const raw = data.response;
    const text =
      typeof raw === "string"
        ? raw
        : raw != null
          ? JSON.stringify(raw, null, 2)
          : "The debrief agent returned an empty response. Try rephrasing your message.";
    return {
      role: "assistant",
      text,
      notice: data.notice ?? null,
    };
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-4 pt-8 pb-8">
      <div className="w-full max-w-2xl">
        <Label>Flight to debrief</Label>
        {loadingFlights ? (
          <p className="text-sm text-muted-foreground">Loading flights…</p>
        ) : flightError ? (
          <p className="text-sm text-destructive">{flightError}</p>
        ) : flights.length === 0 ? (
          <p className="text-sm text-muted-foreground">No saved flights yet. Create a pre-flight first.</p>
        ) : (
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
        )}
      </div>

      {saved && (
        <div className="w-full max-w-2xl">
          <Card className="border-caution/40">
            <CardHeader><CardTitle className="text-base text-caution">Identified weak points — DRAFT (pending instructor review, not a final verdict)</CardTitle></CardHeader>
            <CardContent>
              <p className="mb-2 text-xs text-caution">{saved.identified_weak_points?.status}</p>
              <ul className="list-disc pl-5 text-sm">
                {(saved.identified_weak_points?.items ?? []).map((it: string, i: number) => (<li key={i}>{it}</li>))}
              </ul>
              {saved.coaching_notes && (
                <>
                  <h4 className="mt-3 font-medium">Coaching notes</h4>
                  <div className="text-muted-foreground">
                    <AnswerView text={saved.coaching_notes} />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex min-h-0 w-full max-w-2xl flex-1 flex-col">
        <ChatPanel placeholder="Tell me how the flight went…" onSend={send} />
      </div>
    </div>
  );
}
