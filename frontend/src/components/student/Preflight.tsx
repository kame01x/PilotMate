"use client";

import { useCallback, useRef, useState } from "react";
import ChatPanel, { ChatTurn } from "@/components/ChatPanel";
import BriefingReport from "@/components/preflight/BriefingReport";
import MassBalanceSection from "@/components/preflight/MassBalanceSection";
import { apiFetch } from "@/lib/api";
import { mbSummary, type MBResult } from "@/lib/massBalance";
import {
  cancelPreflight,
  streamPreflight,
  type BriefingSection,
  type StreamEvent,
} from "@/lib/preflightStream";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface RouteSuggestion {
  name: string;
  description: string;
  waypoints: string[];
}

const EXERCISE_CATEGORIES: { name: string; items: string[] }[] = [
  {
    name: "Take-off and Landing",
    items: [
      "Normal take-off",
      "Crosswind take-off",
      "Short-field take-off",
      "Soft-field take-off",
      "Normal approach and landing",
      "Crosswind approach and landing",
      "Short-field landing",
      "Soft-field landing",
      "Go-around / balked landing",
      "Rejected take-off",
      "Touch-and-go landing",
      "Landing without flaps",
      "Circuit joining procedures",
      "Standard traffic circuit",
      "Non-standard circuit procedures",
      "Runway incursion avoidance",
      "Flapless circuits",
      "Go-around from the circuit",
      "Circuit spacing and sequencing",
      "Landing and runway vacating procedures",
    ],
  },
  {
    name: "Navigation and Cross-country",
    items: [
      "Local navigation exercise",
      "Visual navigation",
      "Map reading and chart interpretation",
      "Ground feature identification",
      "Pilotage",
      "Dead reckoning",
      "Track and heading calculations",
      "Wind correction angle",
      "Groundspeed calculations",
      "Estimated time en route",
      "ETA calculations",
      "Diversion planning",
      "In-flight diversion",
      "Position fixing",
      "Lost-procedure exercise",
      "Radio navigation familiarization",
      "VOR navigation",
      "GNSS/GPS navigation",
      "Controlled-airspace transit",
      "Uncontrolled-airspace procedures",
      "Cross-country flight planning",
      "Cross-country navigation",
      "Dual cross-country flight",
      "Solo cross-country flight",
      "Land-away navigation exercise",
    ],
  },
  {
    name: "Abnormal and Emergency Procedures",
    items: [
      "Engine failure after take-off",
      "Simulated engine failure in flight",
      "Forced landing without power",
      "Precautionary landing",
      "Emergency descent",
      "Fire on the ground",
      "Engine fire in flight",
      "Electrical system failure",
      "Radio failure procedures",
      "Instrument or equipment malfunction",
      "Abnormal engine indications",
      "Carburettor icing recognition",
      "Door opening in flight",
      "Emergency checklist practice",
      "Suitable field selection",
      "MAYDAY and PAN-PAN procedures",
      "Emergency landing briefing",
      "Diversion following an abnormal situation",
    ],
  },
  {
    name: "Instrument Flight and Unusual Attitudes",
    items: [
      "Basic instrument flight",
      "Straight and level on instruments",
      "Instrument climbing",
      "Instrument descending",
      "Instrument turns",
      "Recovery from unusual attitudes",
      "Spatial disorientation awareness",
      "Instrument failure awareness",
      "Partial-panel familiarization",
      "VOR tracking",
      "GNSS approach-system familiarization",
    ],
  },
  {
    name: "Night Flying",
    items: [
      "Night pre-flight preparation",
      "Night visual inspection",
      "Night taxiing",
      "Night take-off",
      "Night circuit training",
      "Night approach and landing",
      "Night go-around",
      "Night navigation",
      "Night visual orientation",
      "Night diversion planning",
      "Night emergency considerations",
      "Night cross-country flight",
    ],
  },
  {
    name: "Human Factors and Operational Procedures",
    items: [
      "Threat and error management",
      "Situational awareness",
      "Aeronautical decision-making",
      "Workload management",
      "Lookout and collision avoidance",
      "Weather avoidance",
      "Turbulence procedures",
      "Icing awareness",
      "Airspace awareness",
      "Radio phraseology",
      "Flight preparation and briefing",
      "Post-flight inspection",
      "Post-flight debriefing",
    ],
  },
  {
    name: "Aircraft Performance and Specialized Training",
    items: [
      "Aircraft performance calculations",
      "Weight and balance exercise",
      "Take-off and landing performance",
      "Fuel planning",
      "Range and endurance calculations",
      "Aircraft systems familiarization",
      "Performance-limited take-off and landing",
      "Multi-engine familiarization",
      "Asymmetric flight and engine-failure training",
      "Complex-aircraft familiarization",
      "Tailwheel familiarization",
      "Aerobatic familiarization",
    ],
  },
];

export default function Preflight() {
  const [started, setStarted] = useState(false);
  const [departure, setDeparture] = useState("");
  const [destination, setDestination] = useState("");
  const [route, setRoute] = useState("");
  const [routeMode, setRouteMode] = useState("");
  const [aircraftType, setAircraftType] = useState("Cessna 172");
  const [aircraftRegistration, setAircraftRegistration] = useState("");
  const [exercises, setExercises] = useState<string[]>([]);
  const [customExercise, setCustomExercise] = useState("");
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [rules, setRules] = useState("VFR");
  const [depRunwaySurface, setDepRunwaySurface] = useState("");
  const [depControlled, setDepControlled] = useState("");
  const [destRunwaySurface, setDestRunwaySurface] = useState("");
  const [destControlled, setDestControlled] = useState("");
  const [flightDate, setFlightDate] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [flightPeriod, setFlightPeriod] = useState("");
  const [authority, setAuthority] = useState("");
  const [runway, setRunway] = useState("");
  const [fuel, setFuel] = useState("");
  const [endurance, setEndurance] = useState("");
  const [routeSuggestions, setRouteSuggestions] = useState<RouteSuggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);

  // Briefing state (streaming)
  const [sections, setSections] = useState<Record<string, BriefingSection>>({});
  const [pendingSectionIds, setPendingSectionIds] = useState<string[]>([]);
  const [briefingStatus, setBriefingStatus] = useState<"complete" | "partial" | "failed" | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [showFollowUp, setShowFollowUp] = useState(false);

  // Mass & balance: the section registers a calc function here so submit can
  // run a fresh deterministic calculation at submit time (never stale).
  const [mbResult, setMbResult] = useState<MBResult | null>(null);
  const calcRef = useRef<(() => Promise<MBResult | null>) | null>(null);
  const handleMbReady = useCallback((calc: () => Promise<MBResult | null>) => {
    calcRef.current = calc;
  }, []);

  const generationIdRef = useRef<string | null>(null);
  const streamAbortRef = useRef<(() => void) | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamTokenRef = useRef<object>({});

  const canSuggest = departure.trim() && destination.trim() && aircraftType.trim();
  const canSubmit = departure.trim() && depRunwaySurface && depControlled && flightPeriod && (!destination.trim() || (destRunwaySurface && destControlled));

  function toggleExercise(ex: string) {
    setExercises((prev) => prev.includes(ex) ? prev.filter((e) => e !== ex) : [...prev, ex]);
  }

  function clearStallTimer() {
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }

  function resetBriefingState() {
    // Abort any live stream first so its events can't mutate the fresh state,
    // then mint a new token so already-queued handler calls are dropped.
    streamAbortRef.current?.();
    streamAbortRef.current = null;
    streamTokenRef.current = {};
    setSections({});
    setPendingSectionIds([]);
    setBriefingStatus(null);
    setCounts(null);
    setNotice(null);
    setStreamError(null);
    setShowFollowUp(false);
    generationIdRef.current = null;
    clearStallTimer();
  }

  async function suggestRoute() {
    if (!canSuggest) return;
    setSuggesting(true);
    setRouteSuggestions([]);
    try {
      const data = await apiFetch("/student/preflight/suggest-route", {
        method: "POST",
        body: JSON.stringify({ departure, destination, aircraft_type: aircraftType, exercise: exercises.join(", ") }),
      });
      const routes: RouteSuggestion[] = data.routes || [];
      setRouteSuggestions(routes);
    } catch {
      setRouteSuggestions([]);
    } finally {
      setSuggesting(false);
    }
  }

  function handleStreamEvent(event: StreamEvent) {
    clearStallTimer();
    // Stall guard: if no event arrives for 90s, surface an error (never hang silently)
    stallTimerRef.current = setTimeout(() => {
      setStreamError("The briefing stalled (no update for 90 seconds). Please retry.");
      streamAbortRef.current?.();
    }, 90000);

    switch (event.type) {
      case "generation_started":
        generationIdRef.current = event.generation_id;
        break;
      case "section_started":
        if (event.section_id) {
          setPendingSectionIds((prev) => prev.includes(event.section_id!) ? prev : [...prev, event.section_id!]);
        }
        break;
      case "section_completed":
      case "section_unavailable":
      case "section_failed": {
        const section = event.section;
        if (section) {
          setSections((prev) => ({ ...prev, [section.section_id]: section }));
        }
        if (event.section_id) {
          setPendingSectionIds((prev) => prev.filter((id) => id !== event.section_id));
        }
        break;
      }
      case "generation_completed":
        clearStallTimer();
        setBriefingStatus(event.status ?? "complete");
        setCounts(event.counts ?? null);
        setPendingSectionIds([]);
        break;
      case "generation_failed":
        clearStallTimer();
        setStreamError(event.error ?? "Briefing generation failed.");
        setBriefingStatus("failed");
        setPendingSectionIds([]);
        break;
    }
  }

  async function submit() {
    if (!canSubmit) return;
    // Fresh deterministic mass & balance at submit time (null when there is no
    // registration/schedule — the briefing then falls back to the checklist).
    let freshMb: MBResult | null = null;
    if (calcRef.current) {
      freshMb = await calcRef.current();
    }
    setMbResult(freshMb);
    resetBriefingState();
    setStarted(true);
    // Capture the epoch token minted by resetBriefingState; events from any
    // older (aborted/edited-away) stream fail this identity check and are dropped.
    const token = streamTokenRef.current;
    const message = `I am starting a flight: departure ${departure}, destination ${destination || "local"}, route ${route || "local"}, aircraft ${aircraftType}, exercise ${exercises.join(", ") || "general"}, flight rules ${rules}. Please build the pre-flight package.`;
    const payload = {
      message,
      departure,
      destination: destination || undefined,
      route: route || undefined,
      aircraft_type: aircraftType,
      aircraft_registration: aircraftRegistration || undefined,
      exercise: exercises.join(", ") || undefined,
      rules,
      flight_date: flightDate || undefined,
      departure_time: departureTime || undefined,
      flight_period: flightPeriod || "day",
      authority: authority || undefined,
      runway: runway || undefined,
      fuel: fuel || undefined,
      endurance: endurance || undefined,
      departure_runway_surface: depRunwaySurface,
      departure_controlled: depControlled === "controlled",
      destination_runway_surface: destination ? destRunwaySurface : undefined,
      destination_controlled: destination ? destControlled === "controlled" : undefined,
      mass_balance: freshMb ?? undefined,
    };
    const stream = streamPreflight(payload, {
      onEvent: (event) => {
        if (streamTokenRef.current !== token) return; // stale stream — ignore
        handleStreamEvent(event);
      },
      onError: (err) => {
        if (streamTokenRef.current !== token) return;
        clearStallTimer();
        setStreamError(err.message);
      },
    });
    streamAbortRef.current = stream.abort;
    // Set an initial stall timer so a totally silent connection still surfaces
    stallTimerRef.current = setTimeout(() => {
      setStreamError("The briefing stalled (no update for 90 seconds). Please retry.");
      stream.abort();
    }, 90000);
  }

  async function cancel() {
    streamAbortRef.current?.();
    if (generationIdRef.current) {
      await cancelPreflight(generationIdRef.current).catch(() => false);
    }
    clearStallTimer();
    setPendingSectionIds([]);
    if (Object.keys(sections).length > 0) {
      setBriefingStatus("partial");
      setNotice("Generation cancelled — showing the sections that completed.");
    } else {
      setStarted(false);
      resetBriefingState();
    }
  }

  async function sendFollowUp(message: string): Promise<ChatTurn> {
    const data = await apiFetch("/student/preflight/follow-up", {
      method: "POST",
      body: JSON.stringify({
        message,
        generation_id: generationIdRef.current,
        flight_context: {
          departure,
          destination: destination || undefined,
          route: route || undefined,
          aircraft_type: aircraftType,
          aircraft_registration: aircraftRegistration || undefined,
          exercise: exercises.join(", ") || customExercise || undefined,
          rules,
          flight_date: flightDate || undefined,
          departure_time: departureTime || undefined,
          flight_period: flightPeriod || undefined,
          authority: authority || undefined,
          runway: runway || undefined,
          fuel: fuel || undefined,
          endurance: endurance || undefined,
          mass_balance_summary: mbResult ? mbSummary(mbResult) : undefined,
        },
      }),
    });
    return {
      role: "assistant",
      text: typeof data.response === "string" ? data.response : JSON.stringify(data.response, null, 2),
      notice: data.notice ?? null,
    };
  }

  if (!started) {
    return (
      <div className="flex max-w-2xl flex-col gap-5">
        <p className="text-sm text-muted-foreground">
          Fill in your flight details below. Runway surface and controlled status are never assumed — you must confirm them explicitly.
        </p>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Flight Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Flight date</Label>
              <Input type="date" value={flightDate} onChange={(e) => setFlightDate(e.target.value)} />
            </div>
            <div>
              <Label>Planned departure time</Label>
              <Input type="time" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              Flight Period
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  value: "day",
                  label: "Day",
                  icon: "M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M6.34 17.66l-1.41 1.41 M19.07 4.93l-1.41 1.41 M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z",
                  rest: "border-caution/40 bg-caution/10 text-caution hover:bg-caution/20",
                  sel: "border-caution bg-caution/25 text-caution font-medium ring-1 ring-caution/50",
                },
                {
                  value: "night",
                  label: "Night",
                  icon: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z",
                  rest: "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20",
                  sel: "border-primary bg-primary/25 text-primary font-medium ring-1 ring-primary/50",
                },
                {
                  value: "mixed",
                  label: "Mixed",
                  icon: "M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M6.34 17.66l-1.41 1.41 M19.07 4.93l-1.41 1.41 M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z",
                  rest: "border-secondary/40 bg-linear-to-r from-caution/10 to-secondary/10 text-secondary hover:from-caution/20 hover:to-secondary/20",
                  sel: "border-secondary bg-linear-to-r from-caution/25 to-secondary/25 text-secondary font-medium ring-1 ring-secondary/50",
                },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFlightPeriod(opt.value)}
                  className={`flex flex-col items-center gap-1 rounded-md border px-3 py-3 text-sm transition-colors ${
                    flightPeriod === opt.value ? opt.sel : opt.rest
                  }`}
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d={opt.icon} />
                  </svg>
                  {opt.label}
                </button>
              ))}
            </div>
            {flightPeriod === "mixed" && (
              <p className="text-xs text-caution">Mixed flight: the agent will assess day/night transition based on your flight date, departure time, and location.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              Aviation Authority
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={authority} onValueChange={(v) => setAuthority(v ?? "")}>
              <SelectTrigger><SelectValue placeholder="Select authority…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="FAA">FAA — Federal Aviation Administration (US)</SelectItem>
                <SelectItem value="EASA">EASA — European Union Aviation Safety Agency</SelectItem>
                <SelectItem value="UK-CAA">UK CAA — Civil Aviation Authority (UK)</SelectItem>
                <SelectItem value="CAA-NZ">CAA — New Zealand</SelectItem>
                <SelectItem value="CASA">CASA — Australia</SelectItem>
                <SelectItem value="DGAC-FR">DGAC — France</SelectItem>
                <SelectItem value="DFS-DE">DFS — Germany</SelectItem>
                <SelectItem value="AESA-ES">AESA — Spain</SelectItem>
                <SelectItem value="ENAC-IT">ENAC — Italy</SelectItem>
                <SelectItem value="ANAC-BR">ANAC — Brazil</SelectItem>
                <SelectItem value="DGCA-IN">DGCA — India</SelectItem>
                <SelectItem value="JCAB-JP">JCAB — Japan</SelectItem>
                <SelectItem value="CAAS-SG">CAAS — Singapore</SelectItem>
                <SelectItem value="IAA-IE">IAA — Ireland</SelectItem>
                <SelectItem value="ICAO">ICAO — International standards (not a licensing authority)</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Departure airport (ICAO)</Label>
            <Input value={departure} onChange={(e) => setDeparture(e.target.value.toUpperCase())} placeholder="KSQL" />
          </div>
          <div>
            <Label>Destination (optional)</Label>
            <Input value={destination} onChange={(e) => setDestination(e.target.value.toUpperCase())} />
          </div>
        </div>

        {departure.trim() && (
          <Card>
            <CardHeader><CardTitle className="text-base">Departure: {departure.toUpperCase()}</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Runway surface</Label>
                <Select value={depRunwaySurface} onValueChange={(v) => setDepRunwaySurface(v ?? "")}>
                  <SelectTrigger><SelectValue placeholder="Select surface…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grass">Grass</SelectItem>
                    <SelectItem value="concrete">Concrete</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Controlled / Uncontrolled</Label>
                <Select value={depControlled} onValueChange={(v) => setDepControlled(v ?? "")}>
                  <SelectTrigger><SelectValue placeholder="Select status…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="controlled">Controlled</SelectItem>
                    <SelectItem value="uncontrolled">Uncontrolled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Runway (optional)</Label>
                <Input value={runway} onChange={(e) => setRunway(e.target.value)} placeholder="e.g. 29" />
              </div>
            </CardContent>
          </Card>
        )}

        {destination.trim() && (
          <Card>
            <CardHeader><CardTitle className="text-base">Destination: {destination.toUpperCase()}</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Runway surface</Label>
                <Select value={destRunwaySurface} onValueChange={(v) => setDestRunwaySurface(v ?? "")}>
                  <SelectTrigger><SelectValue placeholder="Select surface…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grass">Grass</SelectItem>
                    <SelectItem value="concrete">Concrete</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Controlled / Uncontrolled</Label>
                <Select value={destControlled} onValueChange={(v) => setDestControlled(v ?? "")}>
                  <SelectTrigger><SelectValue placeholder="Select status…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="controlled">Controlled</SelectItem>
                    <SelectItem value="uncontrolled">Uncontrolled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2"/><path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06"/><path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8"/></svg>
              Route
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              {[
                { value: "local", label: "Local training — remain in the local area" },
                { value: "custom", label: "Custom route" },
                { value: "", label: "No route specified" },
              ].map((opt) => (
                <div key={opt.value} className="flex items-center gap-2">
                  <input
                    type="radio"
                    id={`route-${opt.value || "none"}`}
                    name="route"
                    checked={routeMode === opt.value}
                    onChange={() => {
                      setRouteMode(opt.value);
                      if (opt.value !== "custom") setRoute("");
                    }}
                    className="h-4 w-4"
                  />
                  <label htmlFor={`route-${opt.value || "none"}`} className="text-sm">{opt.label}</label>
                </div>
              ))}
            </div>
            {routeMode === "custom" && (
              <Input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="Enter route or training area (e.g. KSQL-KSQL)" />
            )}
            {canSuggest && (
              <div className="flex flex-col gap-2">
                <Button variant="outline" size="sm" onClick={suggestRoute} disabled={suggesting}>
                  {suggesting ? "Suggesting…" : "Suggest route"}
                </Button>
                {routeSuggestions.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-caution">AI-generated suggestions — verify before use.</p>
                    {routeSuggestions.map((r, i) => (
                      <button
                        key={i}
                        type="button"
                        className="rounded-md border border-border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                        onClick={() => {
                          setRouteMode("custom");
                          setRoute(r.waypoints.length > 0 ? r.waypoints.join(" → ") : r.description);
                        }}
                      >
                        <span className="font-medium">{r.name}</span>
                        <span className="mt-0.5 block text-muted-foreground">{r.description}</span>
                        {r.waypoints.length > 0 && (
                          <span className="mt-1 block text-xs text-muted-foreground">{r.waypoints.join(" → ")}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>
              Aircraft
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Aircraft type</Label>
              <Select value={aircraftType} onValueChange={(v) => setAircraftType(v ?? "Cessna 172")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Cessna 150","Cessna 152","Cessna 172","Cessna 172 RG / Cutlass","Cessna 177 Cardinal","Cessna 182 Skylane","Cessna 182 RG","Cessna 206 Stationair","Cessna 210 Centurion","Cessna 310","Cessna 337 Skymaster","Piper PA-28-140","Piper PA-28-160","Piper PA-28-180","Piper PA-28R-200","Piper PA-38-112","Piper PA-44-180","Diamond DA20","Diamond DA40","Diamond DA42","Tecnam P2002","Tecnam P2006T","Tecnam P2010","Tecnam P-Mentor","Robin DR400","Cirrus SR20","Grob G 115","Zlin Z-42","Zlin Z-43","Aquila A210","Socata TB9","Socata TB10","Socata TB20"].map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                  <SelectItem value="other">Other (specify)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Registration (optional)</Label>
              <Input value={aircraftRegistration} onChange={(e) => setAircraftRegistration(e.target.value.toUpperCase())} placeholder="e.g. N12345" />
            </div>
          </CardContent>
        </Card>

        <MassBalanceSection
          registration={aircraftRegistration}
          aircraftType={aircraftType}
          onReady={handleMbReady}
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              Exercises
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label>Custom exercise</Label>
              <div className="flex gap-2">
                <Input
                  value={customExercise}
                  onChange={(e) => setCustomExercise(e.target.value)}
                  placeholder="Type a custom exercise…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customExercise.trim()) {
                      e.preventDefault();
                      if (!exercises.includes(customExercise.trim())) {
                        setExercises((prev) => [...prev, customExercise.trim()]);
                      }
                      setCustomExercise("");
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (customExercise.trim() && !exercises.includes(customExercise.trim())) {
                      setExercises((prev) => [...prev, customExercise.trim()]);
                      setCustomExercise("");
                    }
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
            <div>
              <Input
                value={exerciseSearch}
                onChange={(e) => setExerciseSearch(e.target.value)}
                placeholder="Search exercises…"
              />
            </div>
            <div className="flex flex-col gap-3">
              {EXERCISE_CATEGORIES.map((cat) => {
                const filtered = cat.items.filter((ex) =>
                  ex.toLowerCase().includes(exerciseSearch.toLowerCase())
                );
                if (filtered.length === 0) return null;
                return (
                  <details key={cat.name} className="group" open={exerciseSearch.length > 0}>
                    <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                      {cat.name} ({cat.items.length})
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {filtered.map((ex) => (
                        <button
                          key={ex}
                          type="button"
                          onClick={() => toggleExercise(ex)}
                          className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                            exercises.includes(ex)
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border hover:bg-accent"
                          }`}
                        >
                          {ex}
                        </button>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
            {exercises.length > 0 && (
              <div className="flex flex-wrap gap-2 border-t pt-3">
                <span className="text-xs text-muted-foreground">Selected:</span>
                {exercises.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => toggleExercise(ex)}
                    className="rounded-md border border-primary bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20"
                  >
                    {ex} ×
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Fuel (optional)</Label>
            <Input value={fuel} onChange={(e) => setFuel(e.target.value)} placeholder="e.g. 40 gallons" />
          </div>
          <div>
            <Label>Endurance (optional)</Label>
            <Input value={endurance} onChange={(e) => setEndurance(e.target.value)} placeholder="e.g. 3.5 hours" />
          </div>
        </div>

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

        <Button onClick={submit} disabled={!canSubmit}>
          Generate pre-flight package
        </Button>
      </div>
    );
  }

  // Report view — rendered during AND after generation (progressive sections)
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <BriefingReport
        sections={sections}
        pendingSectionIds={pendingSectionIds}
        status={briefingStatus}
        counts={counts}
        notice={notice}
        error={streamError}
        onCancel={cancel}
        onRetry={submit}
        followUp={
          <div className="mt-2">
            <Button variant="outline" size="sm" onClick={() => setShowFollowUp((v) => !v)}>
              {showFollowUp ? "Hide follow-up" : "Ask a follow-up"}
            </Button>
            {showFollowUp && (
              <div className="mt-3 w-full">
                <ChatPanel placeholder="Ask a follow-up about your pre-flight package…" onSend={sendFollowUp} />
              </div>
            )}
          </div>
        }
      />
      <div>
        <Button variant="outline" size="sm" onClick={() => { setStarted(false); resetBriefingState(); }}>
          Edit details
        </Button>
      </div>
    </div>
  );
}
