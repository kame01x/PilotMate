"use client";

import { useEffect, useState } from "react";
import ChatPanel, { ChatTurn } from "@/components/ChatPanel";
import AnswerView from "@/components/answer/AnswerView";
import { apiFetch } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VIDEO_PICKS, type VideoPick } from "./videoCatalogue";
import { FileText, Plane, Video } from "lucide-react";

interface Flight {
  id: number;
  flight_id: string;
  date: string;
  departure_airport: string;
  destination_airport: string | null;
  aircraft_type: string | null;
  exercise_type: string | null;
  flight_rules: string | null;
  debriefed: boolean;
}

const TEXT = "#0f2a5c";
const MUTED = "#55698f";
const BORDER = "#d6e3f6";
const INNER_BORDER = "#e1eaf8";

export default function Debrief() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [flightError, setFlightError] = useState<string | null>(null);
  const [loadingFlights, setLoadingFlights] = useState(true);
  const [flightId, setFlightId] = useState<string>("");
  const [saved, setSaved] = useState<any | null>(null);

  const selectedFlight = flights.find((f) => String(f.id) === flightId);

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
      <div className="grid w-full max-w-5xl grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
        <section
          className="flex min-h-[420px] flex-col rounded-2xl border bg-white/95 p-[18px] shadow-[0_2px_12px_rgba(31,80,170,0.08)]"
          style={{ borderColor: BORDER }}
          aria-label="Flight to debrief"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-[#e3eeff] text-[#1f6bf5]">
              <Plane className="h-[22px] w-[22px]" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="text-[17px] font-bold" style={{ color: TEXT }}>Flight to debrief</h2>
              <p className="mt-0.5 text-[13px]" style={{ color: MUTED }}>Select a past flight to review and debrief.</p>
            </div>
          </div>

          <div className="mt-3 flex min-h-0 flex-1 flex-col rounded-xl border bg-[#f7faff] p-4" style={{ borderColor: INNER_BORDER }}>
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
        </section>

        {selectedFlight ? (
          <section
            className="flex min-h-[420px] flex-col rounded-2xl border bg-white/95 p-[18px] shadow-[0_2px_12px_rgba(31,80,170,0.08)]"
            style={{ borderColor: BORDER }}
            aria-label="Flight Details"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-[#e3eeff] text-[#1f6bf5]">
                <FileText className="h-[22px] w-[22px]" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-[17px] font-bold" style={{ color: TEXT }}>Flight Details</h2>
                <p className="mt-0.5 text-[13px]" style={{ color: MUTED }}>Key information for the selected flight.</p>
              </div>
            </div>

            <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2 rounded-xl border bg-[#f7faff] p-4 text-sm" style={{ borderColor: INNER_BORDER }}>
              <p><span className="font-medium">Flight ID:</span> {selectedFlight.flight_id}</p>
              <p><span className="font-medium">Exercise:</span> {selectedFlight.exercise_type || "—"}</p>
              <p><span className="font-medium">Date:</span> {selectedFlight.date?.slice(0, 10) || "—"}</p>
              <p><span className="font-medium">Departure:</span> {selectedFlight.departure_airport || "—"}</p>
              <p><span className="font-medium">Destination:</span> {selectedFlight.destination_airport || "—"}</p>
              <p><span className="font-medium">Aircraft:</span> {selectedFlight.aircraft_type || "—"}</p>
              <p><span className="font-medium">Flight rules:</span> {selectedFlight.flight_rules || "—"}</p>
            </div>
          </section>
        ) : (
          <section
            className="flex min-h-[420px] flex-col rounded-2xl border bg-white/95 p-[18px] shadow-[0_2px_12px_rgba(31,80,170,0.08)]"
            style={{ borderColor: BORDER }}
            aria-label="Flight Details"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-[#e3eeff] text-[#1f6bf5]">
                <FileText className="h-[22px] w-[22px]" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-[17px] font-bold" style={{ color: TEXT }}>Flight Details</h2>
                <p className="mt-0.5 text-[13px]" style={{ color: MUTED }}>Key information for the selected flight.</p>
              </div>
            </div>

            <div className="mt-3 flex min-h-0 flex-1 items-center justify-center rounded-xl border bg-[#f7faff] p-4 text-sm" style={{ borderColor: INNER_BORDER }}>
              <p className="text-muted-foreground text-center">Select a flight to view its details.</p>
            </div>
          </section>
        )}

        <section
          className="flex min-h-[420px] flex-col rounded-2xl border bg-white/95 p-[18px] shadow-[0_2px_12px_rgba(31,80,170,0.08)]"
          style={{ borderColor: BORDER }}
          aria-label="Training Video Spotlight"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-[#e3eeff] text-[#1f6bf5]">
              <Video className="h-[22px] w-[22px]" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="text-[17px] font-bold" style={{ color: TEXT }}>Training Video Spotlight</h2>
              <p className="mt-0.5 text-[13px]" style={{ color: MUTED }}>A recommended video for your flight review.</p>
            </div>
          </div>

          <a
            href={VIDEO_PICKS[0]?.url}
            target="_blank"
            rel="noreferrer"
            className="group mt-3 flex min-h-0 flex-1 flex-col gap-4 rounded-xl border bg-[#f7faff] p-4 lg:flex-row lg:items-stretch"
            style={{ borderColor: INNER_BORDER }}
          >
            <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl border bg-[#dce9fb] lg:aspect-auto lg:h-full lg:w-[58%] lg:max-w-[62%]" style={{ borderColor: BORDER }}>
              <img
                src={(VIDEO_PICKS[0] as VideoPick | undefined)?.thumbnailUrl ?? ""}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-[#071f55]/15">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-[#1f6bf5] shadow-sm">
                  <Video className="h-6 w-6" aria-hidden="true" />
                </span>
              </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
              <h3 className="text-[17px] font-bold leading-snug" style={{ color: TEXT }}>{VIDEO_PICKS[0]?.title}</h3>
              <p className="text-[13px] font-semibold text-[#1857cf]">{VIDEO_PICKS[0]?.channel}</p>
              <p className="text-[13px] leading-relaxed" style={{ color: "#3f5580" }}>{VIDEO_PICKS[0]?.description}</p>
            </div>
          </a>
        </section>
      </div>

      {saved && (
        <div className="mt-4 w-full max-w-2xl">
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

      <div className="mt-6 flex min-h-0 w-full max-w-5xl flex-1 flex-col">
        <ChatPanel placeholder="Tell me how the flight went…" onSend={send} />
      </div>
    </div>
  );
}