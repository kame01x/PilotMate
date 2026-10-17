/**
 * Mass & balance types + helpers (Phase 21B).
 * Numbers always come from the deterministic backend engine — this module
 * only formats and transports them.
 */

export type MassUnit = "kg" | "lb";
export type ArmUnit = "cm" | "in" | "m";

export interface MBStation {
  id: string;
  label: string;
  arm: number;
  kind: "seat" | "baggage" | "fuel";
  max_mass?: number | null;
  capacity_l?: number | null;
}

export interface MBEnvelopePoint {
  mass: number;
  min_cg: number;
  max_cg: number;
}

export interface MBSchedule {
  mass_unit: MassUnit;
  arm_unit: ArmUnit;
  empty_mass: number;
  empty_arm?: number | null;
  empty_moment?: number | null;
  max_mass?: number | null;
  min_cg?: number | null;
  max_cg?: number | null;
  default_fuel_density?: number | null;
  default_fuel_density_unit?: string | null;
  fuel_burn_kg_per_hour?: number | null;
  stations: MBStation[];
  envelope?: MBEnvelopePoint[] | null;
}

export interface MBSchedulePayload {
  registration: string;
  aircraft_type: string | null;
  schedule: MBSchedule | null;
  source: string | null;
  revision: string | null;
  verified: boolean;
  updated_at: string | null;
  warnings: string[];
}

export interface MBItem {
  label: string;
  station_id: string | null;
  mass: number;
  arm: number;
  moment: number;
  kind: string;
}

export interface MBTotals {
  mass: number;
  moment: number;
  cg: number;
}

export type MBState = "complete_within" | "complete_outside" | "incomplete" | "unverifiable";

export interface MBViolation {
  code: string;
  message: string;
}

export interface MBCondition {
  mass: number;
  moment: number | null;
  cg: number | null;
}

export interface MBResult {
  registration: string;
  state: MBState;
  reasons: string[];
  violations: MBViolation[];
  notices: string[];
  computed: boolean;
  items: MBItem[];
  totals: MBTotals | null;
  conditions: Record<string, MBCondition>;
  limits: {
    max_mass: number | null;
    min_cg: number | null;
    max_cg: number | null;
    envelope_cg_at_total_mass: { min: number; max: number } | null;
  } | null;
  envelope: MBEnvelopePoint[] | null;
  chart: { included: boolean; reason: string | null };
  units: { mass: string; arm: string; moment: string } | null;
  data_source: {
    registration: string;
    source: string | null;
    revision: string | null;
    verified: boolean;
  };
}

/** Compact one-paragraph summary for the follow-up AI (backend truncates at 400 chars). */
export function mbSummary(r: MBResult): string {
  const u = r.units;
  const t = r.totals;
  const parts: string[] = [`state=${r.state}`];
  if (t && u) parts.push(`takeoff ${t.mass.toFixed(1)} ${u.mass}, CG ${t.cg.toFixed(2)} ${u.arm}`);
  if (r.limits?.max_mass && u) parts.push(`max ${r.limits.max_mass} ${u.mass}`);
  if (r.violations.length) parts.push(`violations: ${r.violations.map((v) => v.message).join(" ")}`);
  else if (r.state === "complete_within") parts.push("within all limits");
  else if (r.reasons.length) parts.push(r.reasons[0]);
  return parts.join("; ").slice(0, 400);
}
