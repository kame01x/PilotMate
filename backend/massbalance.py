"""Deterministic mass & balance engine (Phase 21B).

Hard rules:
- No LLM, no guessing, no generic defaults: every number comes from the
  aircraft's registration-specific weight schedule (user-entered, with
  recorded source/revision) and the loads the student entered.
- All unit conversions are explicit named constants — never an implicit
  litres-to-kilograms assumption.
- Four result states, always present:
    complete_within   — computed, all data present, everything within limits
    complete_outside  — computed, all data present, one or more violations
    incomplete        — required input missing/invalid; calculation refused,
                        with a message requesting exactly what is needed
    unverifiable      — computed, but provenance or limit data is missing so
                        compliance cannot be confirmed; numbers are still
                        shown with an explicit explanation
- Loading conditions (ramp / take-off / landing / zero-fuel) are only emitted
  when the data supports them; otherwise a notice says why they are omitted.
"""
from __future__ import annotations

from typing import Any

KG_PER_LB = 0.45359237
L_PER_US_GAL = 3.785411784
L_PER_IMP_GAL = 4.54609
CM_PER_IN = 2.54
M_PER_CM = 0.01

MASS_UNITS = ("kg", "lb")
VOLUME_UNITS = ("l", "us_gal", "imp_gal")
ARM_UNITS = ("cm", "in", "m")
DENSITY_UNITS = ("kg_per_l", "lb_per_us_gal")

CG_EPSILON = 1e-6


def _to_float(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def _kg_from(mass: float, unit: str) -> float:
    if unit == "kg":
        return mass
    if unit == "lb":
        return mass * KG_PER_LB
    raise ValueError(f"unknown mass unit: {unit}")


def _mass_from_kg(mass_kg: float, unit: str) -> float:
    if unit == "kg":
        return mass_kg
    if unit == "lb":
        return mass_kg / KG_PER_LB
    raise ValueError(f"unknown mass unit: {unit}")


def _litres_from(volume: float, unit: str) -> float:
    if unit == "l":
        return volume
    if unit == "us_gal":
        return volume * L_PER_US_GAL
    if unit == "imp_gal":
        return volume * L_PER_IMP_GAL
    raise ValueError(f"unknown volume unit: {unit}")


def _arm_cm_from(arm: float, unit: str) -> float:
    if unit == "cm":
        return arm
    if unit == "in":
        return arm * CM_PER_IN
    if unit == "m":
        return arm * M_PER_CM * 100.0
    raise ValueError(f"unknown arm unit: {unit}")


def _density_kg_per_l(density: float, unit: str) -> float:
    """Normalise a fuel density to kg/L (the canonical density unit)."""
    if unit == "kg_per_l":
        return density
    if unit == "lb_per_us_gal":
        # lb per US gal → kg per L: (lb × kg/lb) / (gal × L/gal)
        return (density * KG_PER_LB) / L_PER_US_GAL
    raise ValueError(f"unknown density unit: {unit}")


def validate_schedule(schedule: dict | None) -> list[str]:
    """Structural validation for storing a schedule (PUT) — returns problems."""
    problems: list[str] = []
    if not isinstance(schedule, dict):
        return ["schedule must be an object"]
    if schedule.get("mass_unit") not in MASS_UNITS:
        problems.append(f"mass_unit must be one of {MASS_UNITS}")
    if schedule.get("arm_unit") not in ARM_UNITS:
        problems.append(f"arm_unit must be one of {ARM_UNITS}")
    empty_mass = _to_float(schedule.get("empty_mass"))
    if empty_mass is None or empty_mass <= 0:
        problems.append("empty_mass must be a positive number")
    if _to_float(schedule.get("empty_moment")) is None and _to_float(schedule.get("empty_arm")) is None:
        problems.append("either empty_moment or empty_arm is required")
    max_mass = _to_float(schedule.get("max_mass"))
    if max_mass is not None and max_mass <= 0:
        problems.append("max_mass must be a positive number")
    stations = schedule.get("stations")
    if stations is not None and not isinstance(stations, list):
        problems.append("stations must be a list")
    elif isinstance(stations, list):
        seen_ids: set[str] = set()
        for i, st in enumerate(stations):
            if not isinstance(st, dict):
                problems.append(f"stations[{i}] must be an object")
                continue
            sid = st.get("id")
            if not sid or not isinstance(sid, str):
                problems.append(f"stations[{i}] needs a string id")
            elif sid in seen_ids:
                problems.append(f"duplicate station id '{sid}'")
            else:
                seen_ids.add(sid)
            if not st.get("label"):
                problems.append(f"stations[{i}] needs a label")
            arm = _to_float(st.get("arm"))
            if arm is None:
                problems.append(f"stations[{i}] needs a numeric arm")
            kind = st.get("kind")
            if kind not in ("seat", "baggage", "fuel"):
                problems.append(f"stations[{i}] kind must be seat, baggage or fuel")
            smax = st.get("max_mass")
            if smax is not None and (_to_float(smax) is None or _to_float(smax) <= 0):
                problems.append(f"stations[{i}] max_mass must be a positive number")
    envelope = schedule.get("envelope")
    if envelope is not None and not isinstance(envelope, list):
        problems.append("envelope must be a list")
    elif isinstance(envelope, list):
        for i, pt in enumerate(envelope):
            if not isinstance(pt, dict) or _to_float(pt.get("mass")) is None \
                    or _to_float(pt.get("min_cg")) is None or _to_float(pt.get("max_cg")) is None:
                problems.append(f"envelope[{i}] needs numeric mass, min_cg and max_cg")
            elif _to_float(pt.get("min_cg")) > _to_float(pt.get("max_cg")):
                problems.append(f"envelope[{i}] min_cg must be <= max_cg")
    density = schedule.get("default_fuel_density")
    if density is not None:
        if _to_float(density) is None or _to_float(density) <= 0:
            problems.append("default_fuel_density must be a positive number")
        if schedule.get("default_fuel_density_unit") not in DENSITY_UNITS:
            problems.append(
                f"default_fuel_density_unit must be one of {DENSITY_UNITS} — "
                "density units are never assumed"
            )
    return problems


def calculate(
    schedule: dict | None,
    *,
    registration: str,
    source: str | None = None,
    revision: str | None = None,
    verified: bool = False,
    loads: list[dict] | None = None,
    fuel: list[dict] | None = None,
    taxi_fuel: dict | None = None,
    endurance_hours: float | None = None,
) -> dict:
    """Run the deterministic calculation. Always returns a full result dict
    with one of the four states — never raises for bad input."""
    loads = loads or []
    fuel = fuel or []

    data_source = {
        "registration": registration,
        "source": (source or "").strip() or None,
        "revision": (revision or "").strip() or None,
        "verified": bool(verified),
    }
    base: dict[str, Any] = {
        "registration": registration,
        "state": "incomplete",
        "reasons": [],
        "violations": [],
        "notices": [],
        "computed": False,
        "items": [],
        "totals": None,
        "conditions": {},
        "limits": None,
        "envelope": None,
        "chart": {"included": False, "reason": "No calculation available."},
        "units": None,
        "data_source": data_source,
    }

    # --- 1. schedule presence & core fields -------------------------------
    if not isinstance(schedule, dict) or not schedule:
        base["reasons"].append(
            f"No weight schedule is on file for {registration or 'this aircraft'}. "
            "Enter the aircraft's weight schedule (empty mass, arms, limits and "
            "source) to run a mass & balance calculation."
        )
        return base

    mass_unit = schedule.get("mass_unit")
    arm_unit = schedule.get("arm_unit")
    if mass_unit not in MASS_UNITS or arm_unit not in ARM_UNITS:
        base["reasons"].append(
            "The weight schedule is missing valid mass/arm units — re-enter it."
        )
        return base

    empty_mass = _to_float(schedule.get("empty_mass"))
    empty_arm = _to_float(schedule.get("empty_arm"))
    empty_moment = _to_float(schedule.get("empty_moment"))
    if empty_mass is None or empty_mass <= 0:
        base["reasons"].append("The weight schedule is missing a valid empty mass.")
        return base
    if empty_moment is None and empty_arm is None:
        base["reasons"].append(
            "The weight schedule is missing the empty CG arm or moment."
        )
        return base
    empty_moment_val = empty_moment if empty_moment is not None else empty_mass * empty_arm

    stations: list[dict] = []
    for st in schedule.get("stations") or []:
        if isinstance(st, dict) and st.get("id") and _to_float(st.get("arm")) is not None:
            stations.append(st)
    station_by_id = {st["id"]: st for st in stations}

    base["units"] = {"mass": mass_unit, "arm": arm_unit, "moment": f"{mass_unit}·{arm_unit}"}
    base["limits"] = {
        "max_mass": _to_float(schedule.get("max_mass")),
        "min_cg": _to_float(schedule.get("min_cg")),
        "max_cg": _to_float(schedule.get("max_cg")),
    }
    envelope = schedule.get("envelope") if isinstance(schedule.get("envelope"), list) else None
    if envelope:
        parsed = [
            {"mass": _to_float(p.get("mass")), "min_cg": _to_float(p.get("min_cg")),
             "max_cg": _to_float(p.get("max_cg"))}
            for p in envelope if isinstance(p, dict)
        ]
        base["envelope"] = [
            p for p in parsed if p["mass"] is not None
            and p["min_cg"] is not None and p["max_cg"] is not None
        ] or None

    # --- 2. validate loads & fuel -----------------------------------------
    items: list[dict] = []
    problems: list[str] = []

    def add_item(label: str, station_id: str | None, mass: float, arm: float) -> None:
        items.append({
            "label": label,
            "station_id": station_id,
            "mass": mass,
            "arm": arm,
            "moment": mass * arm,
            "kind": "fuel" if (station_id and station_by_id.get(station_id, {}).get("kind") == "fuel")
                    else ("empty" if station_id is None else "load"),
        })

    add_item("Empty aircraft", None, empty_mass,
             empty_moment_val / empty_mass)

    for i, ld in enumerate(loads):
        if not isinstance(ld, dict):
            problems.append(f"load[{i}] must be an object")
            continue
        sid = ld.get("station_id")
        st = station_by_id.get(sid)
        if st is None:
            problems.append(f"load[{i}] references unknown station '{sid}'")
            continue
        mass = _to_float(ld.get("mass"))
        if mass is None or mass < 0:
            problems.append(f"load for '{st.get('label', sid)}' needs a mass >= 0")
            continue
        unit = ld.get("mass_unit") or mass_unit
        if unit not in MASS_UNITS:
            problems.append(f"load for '{st.get('label', sid)}' has unknown mass unit '{unit}'")
            continue
        mass_in_schedule_unit = mass if unit == mass_unit else _mass_from_kg(_kg_from(mass, unit), mass_unit)
        st_max = _to_float(st.get("max_mass"))
        if st_max is not None and mass_in_schedule_unit > st_max + CG_EPSILON:
            base["violations"].append({
                "code": "station_over_mass",
                "message": f"{st.get('label', sid)}: {round(mass_in_schedule_unit, 2)} {mass_unit} "
                           f"exceeds its limit of {st_max} {mass_unit}.",
            })
        if st.get("kind") == "fuel":
            problems.append(f"'{st.get('label', sid)}' is a fuel station — add its fuel below, not as a load")
            continue
        add_item(str(st.get("label") or sid), sid, mass_in_schedule_unit, _to_float(st.get("arm")))

    fuel_masses: list[float] = []
    for i, f in enumerate(fuel):
        if not isinstance(f, dict):
            problems.append(f"fuel[{i}] must be an object")
            continue
        sid = f.get("station_id")
        st = station_by_id.get(sid)
        if st is None or st.get("kind") != "fuel":
            problems.append(f"fuel[{i}] references unknown fuel station '{sid}'")
            continue
        volume = _to_float(f.get("volume"))
        if volume is None or volume < 0:
            problems.append(f"fuel for '{st.get('label', sid)}' needs a volume >= 0")
            continue
        vol_unit = f.get("volume_unit")
        if vol_unit not in VOLUME_UNITS:
            problems.append(f"fuel for '{st.get('label', sid)}' has unknown volume unit '{vol_unit}'")
            continue
        density = _to_float(f.get("density"))
        density_unit = f.get("density_unit")
        if density is None:
            density = _to_float(schedule.get("default_fuel_density"))
            du = schedule.get("default_fuel_density_unit")
            density_unit = du if du in DENSITY_UNITS else None
        if density is None or density_unit not in DENSITY_UNITS:
            problems.append(
                f"fuel for '{st.get('label', sid)}' needs a density with its unit (or the "
                "schedule must provide default_fuel_density) — density cannot be assumed"
            )
            continue
        litres = _litres_from(volume, vol_unit)
        kg = litres * _density_kg_per_l(density, density_unit)
        mass = _mass_from_kg(kg, mass_unit)
        capacity_l = _to_float(st.get("capacity_l"))
        if capacity_l is not None and litres > capacity_l + CG_EPSILON:
            base["violations"].append({
                "code": "fuel_over_capacity",
                "message": f"{st.get('label', sid)}: {round(litres, 2)} L exceeds tank capacity "
                           f"of {capacity_l} L.",
            })
        fuel_masses.append(mass)
        add_item(f"{st.get('label') or sid} (fuel)", sid, mass, _to_float(st.get("arm")))

    if problems:
        base["reasons"].extend(problems)
        return base

    total_mass = sum(it["mass"] for it in items)
    if total_mass <= 0:
        base["reasons"].append("Total mass is zero — check the empty mass and loads.")
        return base
    total_moment = sum(it["moment"] for it in items)
    cg = total_moment / total_mass

    # --- 3. loading conditions --------------------------------------------
    zero_fuel_mass = total_mass - sum(fuel_masses)
    zero_fuel_moment = total_moment - sum(it["moment"] for it in items if it["kind"] == "fuel")
    conditions: dict[str, dict] = {
        "takeoff": {"mass": total_mass, "moment": total_moment, "cg": cg},
        "zero_fuel": {
            "mass": zero_fuel_mass,
            "moment": zero_fuel_moment,
            "cg": (zero_fuel_moment / zero_fuel_mass) if zero_fuel_mass > 0 else None,
        },
    }
    if taxi_fuel is not None:
        tv = _to_float(taxi_fuel.get("volume"))
        tu = taxi_fuel.get("volume_unit")
        td = _to_float(taxi_fuel.get("density"))
        tdu = taxi_fuel.get("density_unit")
        if td is None:
            td = _to_float(schedule.get("default_fuel_density"))
            sdu = schedule.get("default_fuel_density_unit")
            tdu = sdu if sdu in DENSITY_UNITS else None
        if tv is not None and tu in VOLUME_UNITS and td is not None and tdu in DENSITY_UNITS and fuel_masses:
            taxi_mass = _mass_from_kg(_litres_from(tv, tu) * _density_kg_per_l(td, tdu), mass_unit)
            ramp_mass = total_mass + taxi_mass
            # Taxi fuel leaves the same tanks that hold the loaded fuel — place
            # it at the mass-weighted arm of the loaded fuel items.
            fuel_items = [it for it in items if it["kind"] == "fuel"]
            fuel_arm = sum(it["moment"] for it in fuel_items) / sum(it["mass"] for it in fuel_items)
            ramp_moment = total_moment + taxi_mass * fuel_arm
            conditions["ramp"] = {
                "mass": ramp_mass, "moment": ramp_moment, "cg": ramp_moment / ramp_mass,
            }
        elif tv is not None and tu in VOLUME_UNITS and td is not None and tdu in DENSITY_UNITS:
            taxi_mass = _mass_from_kg(_litres_from(tv, tu) * _density_kg_per_l(td, tdu), mass_unit)
            conditions["ramp"] = {"mass": total_mass + taxi_mass, "moment": None, "cg": None}
            base["notices"].append(
                "Ramp condition mass shown without CG — no loaded fuel to place the taxi fuel against."
            )
        else:
            base["notices"].append(
                "Ramp condition omitted — taxi fuel needs a valid volume and density."
            )
    burn_rate = _to_float(schedule.get("fuel_burn_kg_per_hour"))
    if burn_rate is not None and endurance_hours is not None and endurance_hours >= 0 and fuel_masses:
        burn = _mass_from_kg(burn_rate * endurance_hours, mass_unit)
        landing_mass = total_mass - burn
        if 0 < burn <= sum(fuel_masses) + CG_EPSILON:
            fuel_items = [it for it in items if it["kind"] == "fuel"]
            fuel_arm = sum(it["moment"] for it in fuel_items) / sum(it["mass"] for it in fuel_items)
            landing_moment = total_moment - burn * fuel_arm
            conditions["landing"] = {
                "mass": landing_mass, "moment": landing_moment,
                "cg": landing_moment / landing_mass,
            }
        else:
            base["notices"].append("Landing condition omitted — planned burn exceeds loaded fuel.")
    elif fuel_masses:
        base["notices"].append(
            "Landing condition omitted — the schedule has no fuel burn rate or no endurance was given."
        )

    # --- 4. limits / compliance (on the take-off condition) ---------------
    max_mass = base["limits"]["max_mass"]
    if max_mass is not None:
        if total_mass > max_mass + CG_EPSILON:
            base["violations"].append({
                "code": "over_max_mass",
                "message": f"Take-off mass {round(total_mass, 2)} {mass_unit} exceeds the limit "
                           f"of {max_mass} {mass_unit}.",
            })

    cg_min_allowed = base["limits"]["min_cg"]
    cg_max_allowed = base["limits"]["max_cg"]
    cg_checked = False
    if base["envelope"]:
        pts = sorted((p for p in base["envelope"] if p["mass"] is not None),
                     key=lambda p: p["mass"])
        masses = [p["mass"] for p in pts]
        if total_mass < masses[0] - CG_EPSILON or total_mass > masses[-1] + CG_EPSILON:
            base["violations"].append({
                "code": "outside_envelope_mass_range",
                "message": f"Total mass {round(total_mass, 2)} {mass_unit} is outside the "
                           f"envelope's mass range ({masses[0]}–{masses[-1]} {mass_unit}).",
            })
            cg_checked = True
        else:
            lower = max((p for p in pts if p["mass"] <= total_mass + CG_EPSILON),
                        key=lambda p: p["mass"], default=None)
            upper = min((p for p in pts if p["mass"] >= total_mass - CG_EPSILON),
                        key=lambda p: p["mass"], default=None)
            if lower and upper and upper["mass"] != lower["mass"]:
                t = (total_mass - lower["mass"]) / (upper["mass"] - lower["mass"])
                cg_min_allowed = lower["min_cg"] + t * (upper["min_cg"] - lower["min_cg"])
                cg_max_allowed = lower["max_cg"] + t * (upper["max_cg"] - lower["max_cg"])
            else:
                cg_min_allowed = lower["min_cg"]
                cg_max_allowed = lower["max_cg"]
            cg_checked = True
    elif cg_min_allowed is not None or cg_max_allowed is not None:
        cg_checked = True

    if cg_checked:
        if cg_min_allowed is not None and cg < cg_min_allowed - CG_EPSILON:
            base["violations"].append({
                "code": "cg_below_min",
                "message": f"CG {round(cg, 2)} {arm_unit} is below the limit of "
                           f"{round(cg_min_allowed, 2)} {arm_unit}.",
            })
        if cg_max_allowed is not None and cg > cg_max_allowed + CG_EPSILON:
            base["violations"].append({
                "code": "cg_above_max",
                "message": f"CG {round(cg, 2)} {arm_unit} is above the limit of "
                           f"{round(cg_max_allowed, 2)} {arm_unit}.",
            })

    base["limits"]["envelope_cg_at_total_mass"] = (
        {"min": cg_min_allowed, "max": cg_max_allowed} if cg_checked else None
    )

    # --- 5. provenance & final state --------------------------------------
    if not data_source["source"]:
        base["notices"].append(
            "Weight schedule has no recorded source — compliance cannot be verified."
        )
    if not cg_checked:
        base["notices"].append(
            "No CG limits or envelope on file — CG is computed but cannot be checked."
        )

    base["computed"] = True
    base["items"] = items
    base["totals"] = {"mass": total_mass, "moment": total_moment, "cg": cg}
    base["conditions"] = conditions

    if base["envelope"]:
        base["chart"] = {"included": True, "reason": None}
    else:
        base["chart"] = {
            "included": False,
            "reason": "No verified CG envelope on file for this aircraft — "
                      "enter the envelope from the POH/AFM to plot it.",
        }

    if base["violations"]:
        base["state"] = "complete_outside"
        return base

    unverifiable: list[str] = []
    if not data_source["source"]:
        unverifiable.append(
            "The weight schedule's data source is not recorded — enter where the "
            "figures came from (e.g. weight schedule revision) before relying on this result."
        )
    if not cg_checked:
        unverifiable.append(
            "No CG limits or envelope on file — total mass can be checked, but CG "
            "compliance cannot be verified."
        )
    if unverifiable:
        base["state"] = "unverifiable"
        base["reasons"] = unverifiable
        return base

    base["state"] = "complete_within"
    return base
