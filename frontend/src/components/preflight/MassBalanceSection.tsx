"use client";

/**
 * Mass & Balance section of the pre-flight form (Phase 21B).
 *
 * - Reads the registration-specific weight schedule from the backend
 *   (or guides the student to enter it when none is on file).
 * - Loads/fuel inputs are driven by the schedule's stations — adaptive per
 *   aircraft. All numbers are sent to the deterministic backend calculator;
 *   this component NEVER computes or invents a figure itself.
 * - Renders the professional result: status banner (4 states), violations,
 *   item table with totals, loading conditions, data source, and the CG
 *   envelope chart only when verified envelope points exist.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import type { MBResult, MBSchedulePayload, MBStation } from "@/lib/massBalance";
import CgEnvelope from "@/components/preflight/CgEnvelope";

type Phase = "need_registration" | "loading" | "notfound" | "loaded" | "error";

const STATE_STYLE: Record<MBResult["state"], { label: string; className: string }> = {
  complete_within: { label: "Calculation complete — all values within limits", className: "border-success/50 bg-success/10 text-success" },
  complete_outside: { label: "Calculation complete — LIMIT EXCEEDED", className: "border-destructive/50 bg-destructive/10 text-destructive" },
  incomplete: { label: "Calculation incomplete — required data missing", className: "border-caution/50 bg-caution/10 text-caution" },
  unverifiable: { label: "Calculation complete but UNVERIFIABLE", className: "border-caution/50 bg-caution/10 text-caution" },
};

interface StationDraft {
  key: number;
  label: string;
  arm: string;
  kind: MBStation["kind"];
  max_mass: string;
  capacity_l: string;
}
interface EnvDraft {
  key: number;
  mass: string;
  min: string;
  max: string;
}
interface EntryDraft {
  aircraft_type: string;
  mass_unit: string;
  arm_unit: string;
  empty_mass: string;
  empty_arm: string;
  max_mass: string;
  min_cg: string;
  max_cg: string;
  density: string;
  density_unit: string;
  burn: string;
  source: string;
  revision: string;
  stations: StationDraft[];
  envelope: EnvDraft[];
}

let draftKey = 0;

function emptyEntry(aircraftType: string): EntryDraft {
  return {
    aircraft_type: aircraftType,
    mass_unit: "kg",
    arm_unit: "cm",
    empty_mass: "",
    empty_arm: "",
    max_mass: "",
    min_cg: "",
    max_cg: "",
    density: "",
    density_unit: "kg_per_l",
    burn: "",
    source: "",
    revision: "",
    stations: [],
    envelope: [],
  };
}

export default function MassBalanceSection({
  registration,
  aircraftType,
  onReady,
}: {
  registration: string;
  aircraftType: string;
  onReady: (calc: () => Promise<MBResult | null>) => void;
}) {
  const [phase, setPhase] = useState<Phase>("need_registration");
  const [payload, setPayload] = useState<MBSchedulePayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showEntry, setShowEntry] = useState(false);
  const [entry, setEntry] = useState<EntryDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [loadMass, setLoadMass] = useState<Record<string, string>>({});
  const [fuelVol, setFuelVol] = useState<Record<string, { v: string; unit: string }>>({});
  const [taxi, setTaxi] = useState<{ v: string; unit: string }>({ v: "", unit: "l" });
  const [enduranceH, setEnduranceH] = useState("");
  const [densityOv, setDensityOv] = useState<{ v: string; unit: string }>({ v: "", unit: "kg_per_l" });

  const [result, setResult] = useState<MBResult | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);

  const schedule = payload?.schedule ?? null;
  const reg = registration.trim().toUpperCase();

  /* ---- reset per-registration state during render when reg changes ---- */
  const [prevReg, setPrevReg] = useState<string | null>(null);
  if (prevReg !== reg) {
    setPrevReg(reg);
    setResult(null);
    setCalcError(null);
    setLoadError(null);
    setPayload(null);
    setShowEntry(false);
    setEntry(null);
    setLoadMass({});
    setFuelVol({});
    setTaxi({ v: "", unit: "l" });
    setEnduranceH("");
    setDensityOv({ v: "", unit: "kg_per_l" });
    setPhase(reg ? "loading" : "need_registration");
  }

  /* ---- load the registration's weight schedule ---- */
  useEffect(() => {
    if (!reg) return;
    let cancelled = false;
    apiFetch(`/student/aircraft/${encodeURIComponent(reg)}`)
      .then((p: MBSchedulePayload) => {
        if (cancelled) return;
        if (!p.schedule) {
          // Row exists but no schedule saved yet — guide the entry form.
          setPayload(p);
          setPhase("notfound");
          setShowEntry(true);
          setEntry(emptyEntry(aircraftType));
          return;
        }
        setPayload(p);
        setPhase("loaded");
      })
      .catch((err: Error) => {
        if (cancelled) return;
        if (/No weight schedule on file/.test(err.message)) {
          setPhase("notfound");
          setShowEntry(true);
          setEntry(emptyEntry(aircraftType));
        } else {
          setLoadError(err.message);
          setPhase("error");
        }
      });
    return () => {
      cancelled = true;
    };
    // aircraftType only seeds the entry form — not a reload trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reg]);

  /* ---- deterministic calculation (backend) ---- */
  const calc = useCallback(async (): Promise<MBResult | null> => {
    if (!reg || !schedule) return null;
      const num = (v: string): number => {
        const s = v.trim();
        const n = Number(s);
        return s !== "" && Number.isFinite(n) ? n : NaN;
      };
    const loads: { station_id: string; mass: number; mass_unit: string }[] = [];
    const fuel: { station_id: string; volume: number; volume_unit: string; density?: number; density_unit?: string }[] = [];
    for (const st of schedule.stations) {
      if (st.kind === "fuel") {
        const f = fuelVol[st.id];
        if (!f || f.v.trim() === "") continue;
        const v = num(f.v);
        if (Number.isNaN(v)) { setCalcError(`Fuel volume for ${st.label} must be a number.`); return null; }
        const entryFuel: (typeof fuel)[number] = { station_id: st.id, volume: v, volume_unit: f.unit };
        if (densityOv.v.trim() !== "") {
          const d = num(densityOv.v);
          if (Number.isNaN(d)) { setCalcError("Fuel density must be a number."); return null; }
          entryFuel.density = d;
          entryFuel.density_unit = densityOv.unit;
        }
        fuel.push(entryFuel);
      } else {
        const m = loadMass[st.id];
        if (!m || m.trim() === "") continue;
        const n = num(m);
        if (Number.isNaN(n)) { setCalcError(`Mass for ${st.label} must be a number.`); return null; }
        loads.push({ station_id: st.id, mass: n, mass_unit: schedule.mass_unit });
      }
    }
    let taxiPayload: object | null = null;
    if (taxi.v.trim() !== "") {
      const t = num(taxi.v);
      if (Number.isNaN(t)) { setCalcError("Taxi fuel volume must be a number."); return null; }
      taxiPayload = { volume: t, volume_unit: taxi.unit };
      if (densityOv.v.trim() !== "") {
        const d = num(densityOv.v);
        if (Number.isNaN(d)) { setCalcError("Fuel density must be a number."); return null; }
        Object.assign(taxiPayload, { density: d, density_unit: densityOv.unit });
      }
    }
    const endurance = enduranceH.trim() === "" ? null : num(enduranceH);
    if (endurance !== null && Number.isNaN(endurance)) { setCalcError("Endurance must be a number of hours."); return null; }

    setCalculating(true);
    setCalcError(null);
    try {
      const r = await apiFetch("/student/mass-balance/calculate", {
        method: "POST",
        body: JSON.stringify({
          registration: reg,
          loads,
          fuel,
          taxi_fuel: taxiPayload,
          endurance_hours: endurance,
        }),
      });
      setResult(r as MBResult);
      return r as MBResult;
    } catch (err) {
      setCalcError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setCalculating(false);
    }
  }, [reg, schedule, loadMass, fuelVol, taxi, enduranceH, densityOv]);

  // Parent registers the calc function so submit can fetch a fresh result.
  useEffect(() => {
    onReady(calc);
  }, [onReady, calc]);

  /* ---- schedule entry (save) ---- */
  function startEntry() {
    setSaveError(null);
    if (payload?.schedule) {
      const s = payload.schedule;
      setEntry({
        aircraft_type: payload.aircraft_type ?? aircraftType,
        mass_unit: s.mass_unit,
        arm_unit: s.arm_unit,
        empty_mass: String(s.empty_mass ?? ""),
        empty_arm: String(s.empty_arm ?? ""),
        max_mass: s.max_mass != null ? String(s.max_mass) : "",
        min_cg: s.min_cg != null ? String(s.min_cg) : "",
        max_cg: s.max_cg != null ? String(s.max_cg) : "",
        density: s.default_fuel_density != null ? String(s.default_fuel_density) : "",
        density_unit: s.default_fuel_density_unit ?? "kg_per_l",
        burn: s.fuel_burn_kg_per_hour != null ? String(s.fuel_burn_kg_per_hour) : "",
        source: payload.source ?? "",
        revision: payload.revision ?? "",
        stations: (s.stations ?? []).map((st) => ({
          key: draftKey++, label: st.label, arm: String(st.arm), kind: st.kind,
          max_mass: st.max_mass != null ? String(st.max_mass) : "",
          capacity_l: st.capacity_l != null ? String(st.capacity_l) : "",
        })),
        envelope: (s.envelope ?? []).map((p) => ({
          key: draftKey++, mass: String(p.mass), min: String(p.min_cg), max: String(p.max_cg),
        })),
      });
    } else {
      setEntry(emptyEntry(aircraftType));
    }
    setShowEntry(true);
  }

  async function saveEntry() {
    if (!entry) return;
    setSaving(true);
    setSaveError(null);
    const n = (v: string): number | null => (v.trim() === "" ? null : Number(v));
    const scheduleBody = {
      mass_unit: entry.mass_unit,
      arm_unit: entry.arm_unit,
      empty_mass: n(entry.empty_mass),
      empty_arm: n(entry.empty_arm),
      max_mass: n(entry.max_mass),
      min_cg: n(entry.min_cg),
      max_cg: n(entry.max_cg),
      default_fuel_density: n(entry.density),
      default_fuel_density_unit: entry.density ? entry.density_unit : null,
      fuel_burn_kg_per_hour: n(entry.burn),
      stations: entry.stations.map((st, i) => ({
        id: `st_${i + 1}`,
        label: st.label.trim(),
        arm: n(st.arm),
        kind: st.kind,
        max_mass: n(st.max_mass),
        capacity_l: n(st.capacity_l),
      })),
      envelope: entry.envelope.map((p) => ({ mass: n(p.mass), min_cg: n(p.min), max_cg: n(p.max) })),
    };
    try {
      const saved = await apiFetch(`/student/aircraft/${encodeURIComponent(reg)}`, {
        method: "PUT",
        body: JSON.stringify({
          aircraft_type: entry.aircraft_type || aircraftType || null,
          schedule: scheduleBody,
          source: entry.source || null,
          revision: entry.revision || null,
        }),
      });
      setPayload(saved as MBSchedulePayload);
      setPhase("loaded");
      setShowEntry(false);
      setEntry(null);
      setResult(null);
      setLoadMass({});
      setFuelVol({});
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const seatStations = schedule?.stations.filter((s) => s.kind !== "fuel") ?? [];
  const fuelStations = schedule?.stations.filter((s) => s.kind === "fuel") ?? [];
  const hasDefaultDensity = Boolean(schedule?.default_fuel_density);
  const hasEnduranceField = Boolean(schedule?.fuel_burn_kg_per_hour);

  return (
    <Card data-testid="mb-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18 M5 7l7-4 7 4 M5 7l-3 7a4 4 0 0 0 6 0L5 7z M19 7l-3 7a4 4 0 0 0 6 0l-3-7z"/></svg>
          Mass &amp; Balance
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {phase === "need_registration" && (
          <p className="text-sm text-muted-foreground">
            Enter the aircraft registration above to load its weight schedule and calculate mass
            &amp; balance. Nothing is estimated — without a stored schedule the calculation is
            reported as incomplete.
          </p>
        )}

        {phase === "loading" && <p className="text-sm text-muted-foreground">Loading weight schedule…</p>}

        {phase === "error" && <p className="text-sm text-destructive">{loadError}</p>}

        {phase === "notfound" && !showEntry && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-caution">
              No weight schedule on file for <span className="font-mono">{reg}</span>. Enter the
              aircraft&apos;s empty mass, arms, stations and limits (from the weight schedule /
              POH) — or the calculation will remain incomplete.
            </p>
            <Button variant="outline" size="sm" className="self-start" onClick={() => { setEntry(emptyEntry(aircraftType)); setShowEntry(true); }}>
              Enter weight schedule
            </Button>
          </div>
        )}

        {/* ---------------- schedule entry form ---------------- */}
        {showEntry && entry && (
          <div className="flex flex-col gap-4 rounded-md border border-border p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">
                {payload?.schedule ? "Edit" : "Enter"} weight schedule — <span className="font-mono">{reg}</span>
              </p>
              {payload?.schedule && (
                <Button variant="ghost" size="sm" onClick={() => setShowEntry(false)}>Cancel</Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Enter the aircraft-specific figures from its weight schedule / POH. Every figure must
              have a recorded source — no generic or estimated values.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label>Mass unit</Label>
                <Select value={entry.mass_unit} onValueChange={(v) => setEntry({ ...entry, mass_unit: v ?? "kg" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="kg">kg</SelectItem><SelectItem value="lb">lb</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <Label>Arm unit</Label>
                <Select value={entry.arm_unit} onValueChange={(v) => setEntry({ ...entry, arm_unit: v ?? "cm" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="cm">cm</SelectItem><SelectItem value="in">in</SelectItem><SelectItem value="m">m</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <Label>Empty mass ({entry.mass_unit})</Label>
                <Input value={entry.empty_mass} onChange={(e) => setEntry({ ...entry, empty_mass: e.target.value })} placeholder="e.g. 780" />
              </div>
              <div>
                <Label>Empty CG arm ({entry.arm_unit})</Label>
                <Input value={entry.empty_arm} onChange={(e) => setEntry({ ...entry, empty_arm: e.target.value })} placeholder="e.g. 110" />
              </div>
              <div>
                <Label>Max mass ({entry.mass_unit})</Label>
                <Input value={entry.max_mass} onChange={(e) => setEntry({ ...entry, max_mass: e.target.value })} placeholder="e.g. 1157" />
              </div>
              <div>
                <Label>Default fuel density</Label>
                <div className="flex gap-2">
                  <Input value={entry.density} onChange={(e) => setEntry({ ...entry, density: e.target.value })} placeholder="e.g. 0.72" />
                  <Select value={entry.density_unit} onValueChange={(v) => setEntry({ ...entry, density_unit: v ?? "kg_per_l" })}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kg_per_l">kg/L</SelectItem>
                      <SelectItem value="lb_per_us_gal">lb/US gal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Min CG ({entry.arm_unit})</Label>
                <Input value={entry.min_cg} onChange={(e) => setEntry({ ...entry, min_cg: e.target.value })} placeholder="e.g. 85" />
              </div>
              <div>
                <Label>Max CG ({entry.arm_unit})</Label>
                <Input value={entry.max_cg} onChange={(e) => setEntry({ ...entry, max_cg: e.target.value })} placeholder="e.g. 120" />
              </div>
              <div>
                <Label>Fuel burn (kg/h, optional)</Label>
                <Input value={entry.burn} onChange={(e) => setEntry({ ...entry, burn: e.target.value })} placeholder="enables landing condition" />
              </div>
            </div>

            {/* stations editor */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Loading stations</Label>
                <Button
                  variant="outline" size="sm"
                  onClick={() => setEntry({ ...entry, stations: [...entry.stations, { key: draftKey++, label: "", arm: "", kind: "seat", max_mass: "", capacity_l: "" }] })}
                >
                  Add station
                </Button>
              </div>
              {entry.stations.length === 0 && (
                <p className="text-xs text-caution">Add at least the seat, baggage and fuel stations with their arms.</p>
              )}
              {entry.stations.map((st, i) => (
                <div key={st.key} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_5rem_7rem_5rem_5rem_2rem]">
                  <div><Label className="text-xs">Label</Label>
                    <Input value={st.label} onChange={(e) => { const c = [...entry.stations]; c[i] = { ...st, label: e.target.value }; setEntry({ ...entry, stations: c }); }} placeholder="Front seats" />
                  </div>
                  <div><Label className="text-xs">Arm</Label>
                    <Input value={st.arm} onChange={(e) => { const c = [...entry.stations]; c[i] = { ...st, arm: e.target.value }; setEntry({ ...entry, stations: c }); }} />
                  </div>
                  <div><Label className="text-xs">Kind</Label>
                    <Select value={st.kind} onValueChange={(v) => { const c = [...entry.stations]; c[i] = { ...st, kind: v as MBStation["kind"] }; setEntry({ ...entry, stations: c }); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="seat">Seat</SelectItem>
                        <SelectItem value="baggage">Baggage</SelectItem>
                        <SelectItem value="fuel">Fuel tank</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Max mass</Label>
                    <Input value={st.max_mass} onChange={(e) => { const c = [...entry.stations]; c[i] = { ...st, max_mass: e.target.value }; setEntry({ ...entry, stations: c }); }} />
                  </div>
                  <div><Label className="text-xs">Cap. (L)</Label>
                    <Input value={st.capacity_l} onChange={(e) => { const c = [...entry.stations]; c[i] = { ...st, capacity_l: e.target.value }; setEntry({ ...entry, stations: c }); }} />
                  </div>
                  <Button variant="ghost" size="sm" className="px-2"
                    onClick={() => setEntry({ ...entry, stations: entry.stations.filter((_, j) => j !== i) })}>
                    ×
                  </Button>
                </div>
              ))}
            </div>

            {/* envelope editor */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>CG envelope points (optional — enables the chart)</Label>
                <Button
                  variant="outline" size="sm"
                  onClick={() => setEntry({ ...entry, envelope: [...entry.envelope, { key: draftKey++, mass: "", min: "", max: "" }] })}
                >
                  Add point
                </Button>
              </div>
              {entry.envelope.map((p, i) => (
                <div key={p.key} className="grid grid-cols-[1fr_1fr_1fr_2rem] items-end gap-2">
                  <div><Label className="text-xs">Mass</Label>
                    <Input value={p.mass} onChange={(e) => { const c = [...entry.envelope]; c[i] = { ...p, mass: e.target.value }; setEntry({ ...entry, envelope: c }); }} />
                  </div>
                  <div><Label className="text-xs">Min CG</Label>
                    <Input value={p.min} onChange={(e) => { const c = [...entry.envelope]; c[i] = { ...p, min: e.target.value }; setEntry({ ...entry, envelope: c }); }} />
                  </div>
                  <div><Label className="text-xs">Max CG</Label>
                    <Input value={p.max} onChange={(e) => { const c = [...entry.envelope]; c[i] = { ...p, max: e.target.value }; setEntry({ ...entry, envelope: c }); }} />
                  </div>
                  <Button variant="ghost" size="sm" className="px-2"
                    onClick={() => setEntry({ ...entry, envelope: entry.envelope.filter((_, j) => j !== i) })}>
                    ×
                  </Button>
                </div>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Data source (required for verification)</Label>
                <Input value={entry.source} onChange={(e) => setEntry({ ...entry, source: e.target.value })} placeholder="e.g. Weight & balance schedule, rev 4 (2026-02-01)" />
              </div>
              <div>
                <Label>Revision</Label>
                <Input value={entry.revision} onChange={(e) => setEntry({ ...entry, revision: e.target.value })} placeholder="e.g. rev 4" />
              </div>
            </div>

            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={saveEntry} disabled={saving}>{saving ? "Saving…" : "Save weight schedule"}</Button>
              {payload?.schedule && (
                <Button variant="outline" size="sm" onClick={() => setShowEntry(false)}>Cancel</Button>
              )}
            </div>
          </div>
        )}

        {/* ---------------- loaded schedule + inputs ---------------- */}
        {phase === "loaded" && schedule && !showEntry && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/30 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium">{payload?.aircraft_type ?? aircraftType ?? "Aircraft"}</span>
                <span className="font-mono text-xs">{reg}</span>
                <span className="text-xs text-muted-foreground">
                  Empty {schedule.empty_mass} {schedule.mass_unit} @ {schedule.empty_arm ?? "?"} {schedule.arm_unit}
                  {schedule.max_mass != null && <> · Max {schedule.max_mass} {schedule.mass_unit}</>}
                </span>
                {payload?.verified && <span className="rounded bg-success/15 px-1.5 py-0.5 text-[11px] text-success">Instructor verified</span>}
              </div>
              <p className="text-xs text-muted-foreground">
                {payload?.source
                  ? <>Source: {payload.source}{payload.revision ? ` · ${payload.revision}` : ""}</>
                  : <span className="text-caution">No data source recorded — results will be reported as unverifiable.</span>}
              </p>
              <Button variant="link" size="sm" className="h-auto self-start p-0 text-xs" onClick={startEntry}>
                Edit weight schedule
              </Button>
            </div>

            {(payload?.warnings ?? []).map((w) => (
              <p key={w} className="rounded-sm border border-caution/40 bg-caution/10 px-3 py-2 text-xs text-caution">{w}</p>
            ))}

            {seatStations.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">Loading ({schedule.mass_unit})</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {seatStations.map((st) => (
                    <div key={st.id}>
                      <Label>
                        {st.label}
                        <span className="ml-1 text-xs text-muted-foreground">arm {st.arm} {schedule.arm_unit}{st.max_mass != null ? ` · max ${st.max_mass}` : ""}</span>
                      </Label>
                      <Input
                        inputMode="decimal"
                        value={loadMass[st.id] ?? ""}
                        onChange={(e) => setLoadMass({ ...loadMass, [st.id]: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {fuelStations.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">Fuel</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {fuelStations.map((st) => (
                    <div key={st.id}>
                      <Label>
                        {st.label}
                        <span className="ml-1 text-xs text-muted-foreground">arm {st.arm} {schedule.arm_unit}</span>
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          inputMode="decimal"
                          value={fuelVol[st.id]?.v ?? ""}
                          onChange={(e) => setFuelVol({ ...fuelVol, [st.id]: { v: e.target.value, unit: fuelVol[st.id]?.unit ?? (schedule.mass_unit === "lb" ? "us_gal" : "l") } })}
                          placeholder="0"
                        />
                        <Select
                          value={fuelVol[st.id]?.unit ?? (schedule.mass_unit === "lb" ? "us_gal" : "l")}
                          onValueChange={(v) => setFuelVol({ ...fuelVol, [st.id]: { v: fuelVol[st.id]?.v ?? "", unit: v ?? "l" } })}
                        >
                          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="l">litres</SelectItem>
                            <SelectItem value="us_gal">US gal</SelectItem>
                            <SelectItem value="imp_gal">Imp gal</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
                {!hasDefaultDensity && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>Fuel density (no default in schedule)</Label>
                      <div className="flex gap-2">
                        <Input inputMode="decimal" value={densityOv.v} onChange={(e) => setDensityOv({ ...densityOv, v: e.target.value })} placeholder="e.g. 0.72" />
                        <Select value={densityOv.unit} onValueChange={(v) => setDensityOv({ ...densityOv, unit: v ?? "kg_per_l" })}>
                          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="kg_per_l">kg/L</SelectItem>
                            <SelectItem value="lb_per_us_gal">lb/US gal</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Taxi fuel (optional, enables ramp condition)</Label>
                    <div className="flex gap-2">
                      <Input inputMode="decimal" value={taxi.v} onChange={(e) => setTaxi({ ...taxi, v: e.target.value })} placeholder="0" />
                      <Select value={taxi.unit} onValueChange={(v) => setTaxi({ ...taxi, unit: v ?? "l" })}>
                        <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="l">litres</SelectItem>
                          <SelectItem value="us_gal">US gal</SelectItem>
                          <SelectItem value="imp_gal">Imp gal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {hasEnduranceField && (
                    <div>
                      <Label>Endurance (h, enables landing condition)</Label>
                      <Input inputMode="decimal" value={enduranceH} onChange={(e) => setEnduranceH(e.target.value)} placeholder="e.g. 3.5" />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button size="sm" onClick={() => void calc()} disabled={calculating}>
                {calculating ? "Calculating…" : "Calculate mass & balance"}
              </Button>
              {!result && !calcError && (
                <span className="text-xs text-muted-foreground">Runs the deterministic calculator on the backend.</span>
              )}
            </div>
            {calcError && <p className="text-sm text-destructive">{calcError}</p>}

            {result && <ResultPanel result={result} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ result */

function ResultPanel({ result: r }: { result: MBResult }) {
  const st = STATE_STYLE[r.state];
  const u = r.units;
  const t = r.totals;
  return (
    <div className="flex flex-col gap-3" data-testid="mb-result">
      <div className={`rounded-md border px-3 py-2 text-sm font-medium ${st.className}`}>{st.label}</div>

      {r.reasons.length > 0 && (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-caution">
          {r.reasons.map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      )}
      {r.violations.length > 0 && (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-destructive">
          {r.violations.map((x, i) => <li key={i}>{x.message}</li>)}
        </ul>
      )}

      {r.computed && t && u && (
        <>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted/40 text-left">
                  <th className="border-b border-border px-3 py-2 font-semibold">Item</th>
                  <th className="border-b border-border px-3 py-2 text-right font-semibold">Mass ({u.mass})</th>
                  <th className="border-b border-border px-3 py-2 text-right font-semibold">Arm ({u.arm})</th>
                  <th className="border-b border-border px-3 py-2 text-right font-semibold">Moment ({u.moment})</th>
                </tr>
              </thead>
              <tbody>
                {r.items.map((it, i) => (
                  <tr key={i} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-1.5">{it.label}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{it.mass.toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{it.arm.toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{it.moment.toFixed(1)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                  <td className="px-3 py-2">Total (take-off)</td>
                  <td className="px-3 py-2 text-right font-mono">{t.mass.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-mono">CG {t.cg.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-mono">{t.moment.toFixed(1)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {Object.keys(r.conditions).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {(["ramp", "takeoff", "zero_fuel", "landing"] as const).map((name) => {
                const c = r.conditions[name];
                if (!c || c.mass == null) return null;
                return (
                  <span key={name} className="rounded-md border border-border bg-card px-2.5 py-1 text-xs">
                    <span className="text-muted-foreground">{name.replace("_", " ")}:</span>{" "}
                    <span className="font-mono">{c.mass.toFixed(1)} {u.mass}</span>
                    {c.cg != null && <span className="font-mono"> · CG {c.cg.toFixed(2)} {u.arm}</span>}
                  </span>
                );
              })}
            </div>
          )}

          {r.limits?.max_mass != null && (
            <p className="text-xs text-muted-foreground">
              Limit: max {r.limits.max_mass} {u.mass}
              {r.limits.envelope_cg_at_total_mass?.min != null && (
                <> · allowed CG at this mass: {r.limits.envelope_cg_at_total_mass.min.toFixed(2)}–{r.limits.envelope_cg_at_total_mass.max.toFixed(2)} {u.arm}</>
              )}
            </p>
          )}
        </>
      )}

      {r.notices.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {r.notices.map((x, i) => <li key={i}>Note: {x}</li>)}
        </ul>
      )}

      {r.chart.included && r.envelope && r.envelope.length >= 2 && r.totals && u && (
        <CgEnvelope
          envelope={r.envelope}
          cg={r.totals.cg}
          mass={r.totals.mass}
          massUnit={u.mass}
          armUnit={u.arm}
        />
      )}
      {!r.chart.included && r.chart.reason && r.computed && (
        <p className="text-xs text-muted-foreground">Envelope chart: {r.chart.reason}</p>
      )}

      <p className="text-[11px] text-muted-foreground">
        {r.data_source.source
          ? <>Data source: {r.data_source.source}{r.data_source.revision ? ` · ${r.data_source.revision}` : ""}</>
          : "Data source: not recorded"}{" "}
        — deterministic calculation; verify against the POH/AFM before flight.
      </p>
    </div>
  );
}
