"use client";

import { useState } from "react";
import ChatPanel, { ChatTurn } from "@/components/ChatPanel";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Preflight() {
  const [started, setStarted] = useState(false);
  const [departure, setDeparture] = useState("");
  const [destination, setDestination] = useState("");
  const [route, setRoute] = useState("");
  const [aircraftType, setAircraftType] = useState("Cessna 172");
  const [exercise, setExercise] = useState("stall");
  const [rules, setRules] = useState("VFR");

  const seed = `I am starting a flight: departure ${departure || "not set"}, destination ${destination || "local"}, route ${route || "local"}, aircraft ${aircraftType}, exercise ${exercise}, flight rules ${rules}. Please help me build the pre-flight package. Before using anything, please explicitly ask me to confirm the runway surface (grass/concrete) and whether the airport is controlled — I will confirm those myself.`;

  async function send(message: string): Promise<ChatTurn> {
    const data = await apiFetch("/student/preflight", { method: "POST", body: JSON.stringify({ message }) });
    return {
      role: "assistant",
      text: typeof data.response === "string" ? data.response : JSON.stringify(data.response, null, 2),
      notice: data.notice ?? null,
    };
  }

  if (!started) {
    return (
      <div className="flex max-w-xl flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          The agent never assumes runway surface or airport control status — in the conversation it will explicitly ask you to confirm those yourself.
        </p>
        <div><Label>Departure airport (ICAO)</Label><Input value={departure} onChange={(e) => setDeparture(e.target.value)} placeholder="KSQL" /></div>
        <div><Label>Destination (optional)</Label><Input value={destination} onChange={(e) => setDestination(e.target.value)} /></div>
        <div><Label>Route</Label><Input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="local / KSQL-KSQL" /></div>
        <div><Label>Aircraft type</Label><Input value={aircraftType} onChange={(e) => setAircraftType(e.target.value)} /></div>
        <div><Label>Exercise type</Label><Input value={exercise} onChange={(e) => setExercise(e.target.value)} placeholder="stall, slow flight, landing…" /></div>
        <div>
          <Label>Flight rules</Label>
          <Select value={rules} onValueChange={(v) => setRules(v ?? "VFR")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="VFR">VFR</SelectItem>
              <SelectItem value="IFR">IFR</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setStarted(true)}>Start pre-flight chat</Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Confirming runway surface and controlled status is always your explicit choice — never assumed.</p>
      <ChatPanel placeholder="Describe your flight and answer the agent…" onSend={send} initialMessage={seed} />
    </div>
  );
}
