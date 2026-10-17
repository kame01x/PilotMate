"""Phase 21B mass & balance test matrix — deterministic engine cases + API checks.

Run:  uv run python scripts/test_mass_balance.py     (backend must be up on 127.0.0.1:8000)
Engine cases run in-process (exact expected values, hand-computed); API cases
run against the live server with a real auth token.

All schedules below are clearly-labelled SYNTHETIC data (test fixtures only).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import math

import httpx

from backend.massbalance import (
    CM_PER_IN,
    KG_PER_LB,
    L_PER_IMP_GAL,
    L_PER_US_GAL,
    _arm_cm_from,
    calculate,
    validate_schedule,
)

PASS = 0
FAIL = 0


def check(name: str, ok: bool, detail: str = "") -> None:
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"  PASS  {name}")
    else:
        FAIL += 1
        print(f"  FAIL  {name}  {detail}")


# --------------------------------------------------------------------------
# Synthetic fixture — TEST DATA ONLY, not from any real POH/AFM.
# --------------------------------------------------------------------------
def demo_schedule(**overrides) -> dict:
    base = {
        "mass_unit": "lb",
        "arm_unit": "in",
        "empty_mass": 1500.0,
        "empty_arm": 39.0,
        "max_mass": 2300.0,
        "min_cg": 35.0,
        "max_cg": 47.0,
        "default_fuel_density": 6.0,
        "default_fuel_density_unit": "lb_per_us_gal",
        "fuel_burn_kg_per_hour": 8.0,
        "stations": [
            {"id": "front", "label": "Front seats", "arm": 37.0, "kind": "seat", "max_mass": 400.0},
            {"id": "rear", "label": "Rear seats", "arm": 73.0, "kind": "seat", "max_mass": 400.0},
            {"id": "bag1", "label": "Baggage area 1", "arm": 95.0, "kind": "baggage", "max_mass": 120.0},
            {"id": "fuel_left", "label": "Left tank", "arm": 48.0, "kind": "fuel", "capacity_l": 95.0},
            {"id": "fuel_right", "label": "Right tank", "arm": 48.0, "kind": "fuel", "capacity_l": 95.0},
        ],
        "envelope": [
            {"mass": 1500.0, "min_cg": 35.0, "max_cg": 47.0},
            {"mass": 1800.0, "min_cg": 35.0, "max_cg": 47.0},
            {"mass": 2100.0, "min_cg": 36.0, "max_cg": 46.0},
            {"mass": 2300.0, "min_cg": 38.0, "max_cg": 44.0},
        ],
    }
    base.update(overrides)
    return base


SRC = "SYNTHETIC TEST FIXTURE — not real POH data"

IN_LIMITS_LOADS = [
    {"station_id": "front", "mass": 340.0, "mass_unit": "lb"},
    {"station_id": "bag1", "mass": 50.0, "mass_unit": "lb"},
]
IN_LIMITS_FUEL = [
    {"station_id": "fuel_left", "volume": 25.0, "volume_unit": "us_gal"},
    {"station_id": "fuel_right", "volume": 25.0, "volume_unit": "us_gal"},
]
# Hand-computed expectations for IN_LIMITS_* (synthetic schedule above):
#   fuel: 25 gal x 6 lb/gal = 150 lb each tank -> 300 lb @ 48 in = 14,400
#   front: 340 x 37 = 12,580 | bag1: 50 x 95 = 4,750 | empty: 1500 x 39 = 58,500
#   total mass = 1500+340+50+300 = 2190 lb
#   total moment = 90,230 lb-in ; CG = 90230/2190 = 41.196347... in
#   envelope at 2190: t=(2190-2100)/200=0.45 -> CG allowed 36.9..45.1 (within)
#   zero-fuel: 1890 lb, moment 75,830 -> CG 40.1216931...

def run_engine_cases() -> None:
    print("\nEngine cases:")

    r = calculate(demo_schedule(), registration="TEST", source=SRC, revision="t1",
                  loads=IN_LIMITS_LOADS, fuel=IN_LIMITS_FUEL)
    check("1 valid schedule, loads within limits -> complete_within",
          r["state"] == "complete_within", f"got {r['state']} {r['reasons']} {r['violations']}")
    check("1 exact totals (2190 lb, 90230 lb-in, CG 41.196347)",
          r["computed"] and math.isclose(r["totals"]["mass"], 2190.0, abs_tol=1e-9)
          and math.isclose(r["totals"]["moment"], 90230.0, abs_tol=1e-6)
          and math.isclose(r["totals"]["cg"], 90230.0 / 2190.0, abs_tol=1e-9),
          f"got {r['totals']}")

    r2 = calculate(demo_schedule(), registration="TEST", source=SRC,
                   loads=[{"station_id": "front", "mass": 400.0},
                          {"station_id": "rear", "mass": 400.0},
                          {"station_id": "bag1", "mass": 120.0}],
                   fuel=IN_LIMITS_FUEL)
    codes2 = {v["code"] for v in r2["violations"]}
    check("2 over max mass -> complete_outside",
          r2["state"] == "complete_outside", f"got {r2['state']}")
    check("2 violations include over_max_mass + envelope mass range",
          {"over_max_mass", "outside_envelope_mass_range"} <= codes2, f"got {codes2}")

    r3 = calculate(demo_schedule(), registration="TEST", source=SRC,
                   loads=[{"station_id": "rear", "mass": 400.0},
                          {"station_id": "bag1", "mass": 120.0}],
                   fuel=[{"station_id": "fuel_left", "volume": 10.0, "volume_unit": "us_gal"},
                         {"station_id": "fuel_right", "volume": 10.0, "volume_unit": "us_gal"}])
    codes3 = {v["code"] for v in r3["violations"]}
    check("3 CG above envelope -> complete_outside (cg_above_max)",
          r3["state"] == "complete_outside" and "cg_above_max" in codes3,
          f"got {r3['state']} {codes3} cg={r3['totals'] and r3['totals']['cg']}")

    check("4 envelope interpolation at 2190 lb gives 36.9-45.1 in",
          r["limits"]["envelope_cg_at_total_mass"]
          and math.isclose(r["limits"]["envelope_cg_at_total_mass"]["min"], 36.9, abs_tol=1e-9)
          and math.isclose(r["limits"]["envelope_cg_at_total_mass"]["max"], 45.1, abs_tol=1e-9),
          f"got {r['limits']['envelope_cg_at_total_mass']}")

    r5 = calculate(None, registration="NOSUCH")
    check("5 no schedule on file -> incomplete + request message",
          r5["state"] == "incomplete" and any("No weight schedule" in x for x in r5["reasons"]),
          f"got {r5['state']} {r5['reasons']}")

    bad = demo_schedule()
    bad.pop("empty_mass")
    r6 = calculate(bad, registration="TEST", source=SRC)
    check("6 schedule missing empty mass -> incomplete",
          r6["state"] == "incomplete" and any("empty mass" in x for x in r6["reasons"]),
          f"got {r6['state']} {r6['reasons']}")

    r7 = calculate(demo_schedule(), registration="TEST", source=SRC,
                   loads=[{"station_id": "jumpseat", "mass": 80.0}])
    check("7 unknown loading station -> incomplete",
          r7["state"] == "incomplete" and any("unknown station" in x for x in r7["reasons"]),
          f"got {r7['state']} {r7['reasons']}")

    check("8 explicit unit constants: 100 lb = 45.359237 kg",
          math.isclose(100.0 * KG_PER_LB, 45.359237, abs_tol=1e-12))
    check("8 explicit unit constants: 25 US gal = 94.6352946 L",
          math.isclose(25.0 * L_PER_US_GAL, 94.6352946, abs_tol=1e-9))
    check("8 explicit unit constants: 48 in = 121.92 cm",
          math.isclose(_arm_cm_from(48.0, "in"), 48.0 * CM_PER_IN, abs_tol=1e-9))
    lb_load = calculate(demo_schedule(), registration="TEST", source=SRC,
                        loads=[{"station_id": "front", "mass": 77.16179178, "mass_unit": "lb"}],
                        fuel=[])
    kg_front = [i for i in lb_load["items"] if i["station_id"] == "front"][0]["mass"]
    check("8 load given in lb converts into a lb schedule (and kg equivalent is exact)",
          math.isclose(kg_front, 77.16179178, abs_tol=1e-6)
          and math.isclose(kg_front * KG_PER_LB, 35.0, abs_tol=1e-6),
          f"got {kg_front}")

    r9 = calculate(demo_schedule(), registration="TEST", source=SRC,
                   loads=[], fuel=[{"station_id": "fuel_left", "volume": 25.0,
                                    "volume_unit": "us_gal"}])
    fuel_items = [i for i in r9["items"] if i["kind"] == "fuel"]
    check("9 fuel 25 US gal x 6 lb/gal = 150 lb exactly (gal->L->kg->lb path)",
          len(fuel_items) == 1 and math.isclose(fuel_items[0]["mass"], 150.0, abs_tol=1e-9),
          f"got {fuel_items}")

    no_density = demo_schedule()
    no_density.pop("default_fuel_density")
    no_density.pop("default_fuel_density_unit")
    r10 = calculate(no_density, registration="TEST", source=SRC,
                    fuel=[{"station_id": "fuel_left", "volume": 10.0, "volume_unit": "us_gal"}])
    check("10 fuel without any density source -> incomplete (density never assumed)",
          r10["state"] == "incomplete" and any("density" in x for x in r10["reasons"]),
          f"got {r10['state']} {r10['reasons']}")

    r11 = calculate(demo_schedule(), registration="TEST", source=None,
                    loads=IN_LIMITS_LOADS, fuel=IN_LIMITS_FUEL)
    check("11 schedule without recorded source -> unverifiable (numbers still shown)",
          r11["state"] == "unverifiable" and r11["computed"]
          and any("source" in x.lower() for x in r11["reasons"]),
          f"got {r11['state']} {r11['reasons']}")

    no_env = demo_schedule()
    no_env.pop("envelope")
    no_env.pop("min_cg")
    no_env.pop("max_cg")
    r12 = calculate(no_env, registration="TEST", source=SRC,
                    loads=IN_LIMITS_LOADS, fuel=IN_LIMITS_FUEL)
    check("12 no CG limits/envelope -> unverifiable + chart omitted with reason",
          r12["state"] == "unverifiable" and not r12["chart"]["included"]
          and r12["chart"]["reason"] and any("CG limits" in x for x in r12["reasons"]),
          f"got {r12['state']} chart={r12['chart']}")

    r13 = calculate(demo_schedule(), registration="TEST", source=SRC,
                    loads=IN_LIMITS_LOADS, fuel=IN_LIMITS_FUEL,
                    taxi_fuel={"volume": 5.0, "volume_unit": "us_gal"},
                    endurance_hours=2.0)
    cond = r13["conditions"]
    check("13 conditions: ramp + takeoff + zero_fuel + landing all present",
          set(cond) == {"ramp", "takeoff", "zero_fuel", "landing"}, f"got {sorted(cond)}")
    check("13 ramp >= takeoff > landing > zero_fuel ordering",
          cond["ramp"]["mass"] > cond["takeoff"]["mass"] > cond["landing"]["mass"]
          > cond["zero_fuel"]["mass"],
          f"got { {k: round(v['mass'], 2) for k, v in cond.items()} }")
    check("13 ramp = takeoff + 30 lb taxi fuel; landing = takeoff - 16 kg burn",
          math.isclose(cond["ramp"]["mass"], 2220.0, abs_tol=1e-6)
          and math.isclose(cond["landing"]["mass"], 2190.0 - 16.0 / KG_PER_LB, abs_tol=1e-6),
          f"got ramp={cond['ramp']['mass']} landing={cond['landing']['mass']}")

    r14 = calculate(demo_schedule(), registration="TEST", source=SRC, loads=[], fuel=[])
    check("14 envelope present -> chart included with 4 verified points",
          r14["chart"]["included"] and len(r14["envelope"]) == 4,
          f"got {r14['chart']}")
    check("14 empty loading list still computes (empty aircraft only)",
          r14["state"] == "complete_within" and math.isclose(r14["totals"]["mass"], 1500.0),
          f"got {r14['state']} {r14['totals']}")

    # --- station / capacity limits ---
    r15 = calculate(demo_schedule(), registration="TEST", source=SRC,
                    loads=[{"station_id": "front", "mass": 450.0, "mass_unit": "lb"}])
    codes15 = {v["code"] for v in r15["violations"]}
    check("15 individual station limit -> station_over_mass (front 450 > max 400)",
          r15["state"] == "complete_outside" and "station_over_mass" in codes15,
          f"got {r15['state']} {codes15}")
    check("15 station violation does not also trigger over_max_mass",
          "over_max_mass" not in codes15,
          f"got {codes15} mass={r15['totals'] and r15['totals']['mass']}")

    r17 = calculate(demo_schedule(), registration="TEST", source=SRC, loads=[],
                    fuel=[{"station_id": "fuel_left", "volume": 30.0, "volume_unit": "us_gal"}])
    codes17 = {v["code"] for v in r17["violations"]}
    check("17 tank capacity -> fuel_over_capacity (30 gal = 113.56 L > 95 L)",
          "fuel_over_capacity" in codes17,
          f"got {codes17}")

    # --- CG below minimum (forward limit) ---
    fwd = demo_schedule()
    fwd["empty_arm"] = 35.0
    fwd["stations"][0]["arm"] = 30.0
    r16 = calculate(fwd, registration="TEST", source=SRC,
                    loads=[{"station_id": "front", "mass": 400.0, "mass_unit": "lb"}],
                    fuel=[{"station_id": "fuel_left", "volume": 10.0, "volume_unit": "us_gal"},
                          {"station_id": "fuel_right", "volume": 10.0, "volume_unit": "us_gal"}])
    codes16 = {v["code"] for v in r16["violations"]}
    check("16 CG below forward limit -> cg_below_min",
          r16["state"] == "complete_outside" and "cg_below_min" in codes16,
          f"got {r16['state']} {codes16} cg={r16['totals'] and r16['totals']['cg']}")

    # --- explicit density override (kg/L in a kg schedule) ---
    kg = {
        "mass_unit": "kg", "arm_unit": "cm",
        "empty_mass": 780.0, "empty_arm": 110.0, "max_mass": 1157.0,
        "min_cg": 85.0, "max_cg": 120.0,
        "fuel_burn_kg_per_hour": 30.0,
        "stations": [
            {"id": "front", "label": "Front seats", "arm": 95.0, "kind": "seat", "max_mass": 200.0},
            {"id": "fuel_main", "label": "Main tank", "arm": 110.0, "kind": "fuel", "capacity_l": 95.0},
        ],
        "envelope": [{"mass": 780.0, "min_cg": 85.0, "max_cg": 120.0},
                     {"mass": 1000.0, "min_cg": 85.0, "max_cg": 120.0}],
    }
    r18 = calculate(kg, registration="TEST", source=SRC,
                    loads=[{"station_id": "front", "mass": 80.0, "mass_unit": "kg"}],
                    fuel=[{"station_id": "fuel_main", "volume": 50.0, "volume_unit": "l",
                            "density": 0.72, "density_unit": "kg_per_l"}])
    fuel_item = [i for i in r18["items"] if i["kind"] == "fuel"][0]
    check("18 explicit density override: 50 L x 0.72 kg/L = 36 kg exactly",
          math.isclose(fuel_item["mass"], 36.0, abs_tol=1e-9), f"got {fuel_item['mass']}")
    check("18 kg-schedule end-to-end: 896 kg, 97360 kg-cm, CG 108.660714",
          r18["state"] == "complete_within"
          and math.isclose(r18["totals"]["mass"], 896.0, abs_tol=1e-9)
          and math.isclose(r18["totals"]["moment"], 97360.0, abs_tol=1e-6)
          and math.isclose(r18["totals"]["cg"], 97360.0 / 896.0, abs_tol=1e-9),
          f"got {r18['state']} {r18['totals']}")

    # --- imperial gallon fuel path ---
    r19 = calculate(demo_schedule(), registration="TEST", source=SRC, loads=[],
                    fuel=[{"station_id": "fuel_left", "volume": 20.0, "volume_unit": "imp_gal"}])
    fuel19 = [i for i in r19["items"] if i["kind"] == "fuel"][0]
    expected19 = 20.0 * L_PER_IMP_GAL * 6.0 / L_PER_US_GAL
    check("19 imp_gal x 6 lb/gal converts to lb exactly (gal->L->kg->lb)",
          math.isclose(fuel19["mass"], expected19, abs_tol=1e-6),
          f"got {fuel19['mass']} expected {expected19}")

    # --- cross-unit load: kg load in a lb schedule ---
    r20 = calculate(demo_schedule(), registration="TEST", source=SRC,
                    loads=[{"station_id": "front", "mass": 35.0, "mass_unit": "kg"}])
    front20 = [i for i in r20["items"] if i["station_id"] == "front"][0]["mass"]
    check("20 kg load in lb schedule converts exactly (35 kg = 77.16179178 lb)",
          math.isclose(front20, 35.0 / KG_PER_LB, abs_tol=1e-6), f"got {front20}")

    # --- conditions edge cases ---
    r21 = calculate(demo_schedule(), registration="TEST", source=SRC,
                    loads=IN_LIMITS_LOADS,
                    taxi_fuel={"volume": 5.0, "volume_unit": "us_gal"})
    check("21 ramp without loaded fuel -> mass shown without CG + notice",
          "ramp" in r21["conditions"] and r21["conditions"]["ramp"]["cg"] is None
          and math.isclose(r21["conditions"]["ramp"]["mass"], 1890.0 + 30.0, abs_tol=1e-6)
          and any("without CG" in n for n in r21["notices"]),
          f"got ramp={r21['conditions'].get('ramp')} notices={r21['notices']}")

    r22 = calculate(demo_schedule(), registration="TEST", source=SRC, loads=[],
                    fuel=[{"station_id": "fuel_left", "volume": 10.0, "volume_unit": "us_gal"},
                          {"station_id": "fuel_right", "volume": 10.0, "volume_unit": "us_gal"}],
                    endurance_hours=10.0)
    check("22 landing omitted when planned burn exceeds loaded fuel + notice",
          "landing" not in r22["conditions"] and set(r22["conditions"]) == {"takeoff", "zero_fuel"}
          and any("burn exceeds" in n for n in r22["notices"]),
          f"got {sorted(r22['conditions'])} {r22['notices']}")

    r30 = calculate(demo_schedule(), registration="TEST", source=SRC, loads=IN_LIMITS_LOADS, fuel=[])
    check("30 no fuel loaded -> zero_fuel equals take-off (mass and CG)",
          math.isclose(r30["conditions"]["zero_fuel"]["mass"], r30["conditions"]["takeoff"]["mass"], abs_tol=1e-9)
          and math.isclose(r30["conditions"]["zero_fuel"]["cg"], r30["conditions"]["takeoff"]["cg"], abs_tol=1e-9),
          f"got {r30['conditions']}")

    # --- false-safe: violations must beat unverifiable ---
    r23 = calculate(demo_schedule(), registration="TEST", source=None,
                    loads=[{"station_id": "front", "mass": 400.0},
                           {"station_id": "rear", "mass": 400.0},
                           {"station_id": "bag1", "mass": 120.0}],
                    fuel=IN_LIMITS_FUEL)
    check("23 over max mass with NO source -> complete_outside (violations beat unverifiable)",
          r23["state"] == "complete_outside" and any(v["code"] == "over_max_mass" for v in r23["violations"]),
          f"got {r23['state']} {r23['violations']}")

    # --- incomplete: bad inputs ---
    no_arm = demo_schedule()
    no_arm.pop("empty_arm")
    no_arm["empty_moment"] = None
    r24 = calculate(no_arm, registration="TEST", source=SRC)
    check("24 schedule missing empty arm and moment -> incomplete",
          r24["state"] == "incomplete" and any("empty CG" in x for x in r24["reasons"]),
          f"got {r24['state']} {r24['reasons']}")

    r25 = calculate(demo_schedule(), registration="TEST", source=SRC,
                    loads=[{"station_id": "front", "mass": -50.0, "mass_unit": "lb"}])
    check("25 negative load mass -> incomplete",
          r25["state"] == "incomplete" and any(">= 0" in x for x in r25["reasons"]),
          f"got {r25['state']} {r25['reasons']}")

    r26 = calculate(demo_schedule(), registration="TEST", source=SRC,
                    loads=[{"station_id": "fuel_left", "mass": 50.0, "mass_unit": "lb"}])
    check("26 fuel station used as a load -> incomplete",
          r26["state"] == "incomplete" and any("fuel station" in x for x in r26["reasons"]),
          f"got {r26['state']} {r26['reasons']}")

    r27 = calculate(demo_schedule(), registration="TEST", source=SRC, loads=[],
                    fuel=[{"station_id": "fuel_left", "volume": 10.0, "volume_unit": "us_gal",
                            "density": 0.72, "density_unit": "kg_per_gal"}])
    check("27 unknown density unit -> incomplete (unit never assumed)",
          r27["state"] == "incomplete" and any("density" in x for x in r27["reasons"]),
          f"got {r27['state']} {r27['reasons']}")

    r28 = calculate(demo_schedule(), registration="TEST", source=SRC, loads=[],
                    fuel=[{"station_id": "fuel_left", "volume": 10.0, "volume_unit": "gallons"}])
    check("28 unknown volume unit -> incomplete",
          r28["state"] == "incomplete" and any("volume unit" in x for x in r28["reasons"]),
          f"got {r28['state']} {r28['reasons']}")

    # --- mass below envelope range ---
    below = demo_schedule(envelope=[{"mass": 1800.0, "min_cg": 35.0, "max_cg": 47.0},
                                   {"mass": 2100.0, "min_cg": 36.0, "max_cg": 46.0}])
    r29 = calculate(below, registration="TEST", source=SRC, loads=[], fuel=[])
    codes29 = {v["code"] for v in r29["violations"]}
    check("29 mass below envelope range -> outside_envelope_mass_range",
          "outside_envelope_mass_range" in codes29, f"got {codes29}")

    check("fixture validation: demo schedule is structurally valid",
          validate_schedule(demo_schedule()) == [],
          f"got {validate_schedule(demo_schedule())}")
    check("fixture validation: density unit required with default density",
          any("default_fuel_density_unit" in p for p in validate_schedule(
              demo_schedule(default_fuel_density_unit=None))),
          "missing-unit schedule accepted")
    check("fixture validation: min_cg > max_cg rejected",
          any("min_cg" in p for p in validate_schedule(
              demo_schedule(min_cg=50.0, max_cg=40.0))),
          "inverted CG limits accepted")
    check("fixture validation: negative capacity_l rejected",
          any("capacity_l" in p for p in validate_schedule(
              {"mass_unit": "kg", "arm_unit": "cm", "empty_mass": 780.0, "empty_arm": 110.0,
               "stations": [{"id": "f", "label": "F", "arm": 110.0, "kind": "fuel", "capacity_l": -5.0}]})),
          "negative capacity accepted")


def run_api_cases() -> None:
    print("\nAPI cases:")
    base = "http://127.0.0.1:8000"
    with httpx.Client(timeout=30) as c:
        anon = c.get(f"{base}/student/aircraft/TESTREG")
        check("A1 schedule fetch requires auth -> 401", anon.status_code == 401,
              f"got {anon.status_code}")

        login = c.post(f"{base}/auth/student/login",
                       json={"email": "student.demo@example.com", "password": "strong-pass-123"})
        check("A2 demo login -> 200", login.status_code == 200, f"got {login.status_code}")
        if login.status_code != 200:
            return
        token = login.json()["access_token"]
        h = {"Authorization": f"Bearer {token}"}

        got = c.get(f"{base}/student/aircraft/NOSUCHREG-XYZ", headers=h)
        check("A3 unknown registration -> 404", got.status_code == 404,
              f"got {got.status_code}")

        reg = "PYTEST-MB"

        put = c.put(f"{base}/student/aircraft/{reg}", headers=h, json={
            "aircraft_type": "Synthetic Test Plane",
            "schedule": demo_schedule(),
            "source": SRC,
            "revision": "t1",
        })
        check("A4 PUT valid schedule -> 200", put.status_code == 200,
              f"got {put.status_code} {put.text[:200]}")

        got2 = c.get(f"{base}/student/aircraft/{reg}", headers=h)
        body = got2.json() if got2.status_code == 200 else {}
        check("A5 GET roundtrip returns schedule + source + no warnings",
              got2.status_code == 200 and body.get("source") == SRC
              and body.get("schedule", {}).get("empty_mass") == 1500.0
              and body.get("warnings") == [],
              f"got {got2.status_code} {body.get('warnings')}")

        bad_put = c.put(f"{base}/student/aircraft/BADREG", headers=h, json={
            "schedule": {"mass_unit": "stone"},
            "source": "x",
        })
        check("A6 PUT structurally invalid schedule -> 400", bad_put.status_code == 400,
              f"got {bad_put.status_code}")

        calc = c.post(f"{base}/student/mass-balance/calculate", headers=h, json={
            "registration": reg, "loads": IN_LIMITS_LOADS, "fuel": IN_LIMITS_FUEL,
        })
        cb = calc.json() if calc.status_code == 200 else {}
        check("A7 calculate with stored schedule -> 200 complete_within",
              calc.status_code == 200 and cb.get("state") == "complete_within"
              and math.isclose(cb.get("totals", {}).get("mass", 0), 2190.0, abs_tol=1e-6),
              f"got {calc.status_code} {cb.get('state')}")

        calc2 = c.post(f"{base}/student/mass-balance/calculate", headers=h, json={
            "registration": "REG-NO-SCHEDULE",
            "loads": IN_LIMITS_LOADS, "fuel": IN_LIMITS_FUEL,
        })
        cb2 = calc2.json() if calc2.status_code == 200 else {}
        check("A8 calculate without stored schedule -> 200 incomplete (never null)",
              calc2.status_code == 200 and cb2.get("state") == "incomplete",
              f"got {calc2.status_code} {cb2.get('state')}")

        # Determinism: identical inputs -> byte-identical numbers
        again = c.post(f"{base}/student/mass-balance/calculate", headers=h, json={
            "registration": reg, "loads": IN_LIMITS_LOADS, "fuel": IN_LIMITS_FUEL,
        }).json()
        check("A9 deterministic: two identical requests produce identical totals",
              again.get("totals") == cb.get("totals") and again.get("state") == cb.get("state"),
              f"got {again.get('totals')} vs {cb.get('totals')}")

        # Demo seed (if present) — the UI demo path
        demo = c.post(f"{base}/student/mass-balance/calculate", headers=h, json={
            "registration": "N172DEMO", "loads": IN_LIMITS_LOADS, "fuel": IN_LIMITS_FUEL,
        })
        if demo.status_code == 200 and demo.json().get("state") != "incomplete":
            check("A10 seeded N172DEMO calculates (synthetic demo aircraft)",
                  demo.json()["chart"]["included"], f"got {demo.json().get('state')}")
        else:
            print("  SKIP  A10 seeded N172DEMO not present (run seed_demo_aircraft.py)")

        neg = c.post(f"{base}/student/mass-balance/calculate", headers=h, json={
            "registration": reg, "loads": [{"station_id": "front", "mass": -10.0, "mass_unit": "lb"}],
        })
        check("A11 negative load mass rejected -> 422", neg.status_code == 422,
              f"got {neg.status_code}")

        badvol = c.post(f"{base}/student/mass-balance/calculate", headers=h, json={
            "registration": reg, "fuel": [{"station_id": "fuel_left", "volume": 10.0,
                                           "volume_unit": "gallons"}],
        })
        bv = badvol.json() if badvol.status_code == 200 else {}
        check("A12 unknown volume unit -> 200 incomplete (engine handles, never 500)",
              badvol.status_code == 200 and bv.get("state") == "incomplete"
              and any("volume unit" in x for x in bv.get("reasons", [])),
              f"got {badvol.status_code} {bv.get('state')}")

        bad_sched = c.put(f"{base}/student/aircraft/NOEMPTY", headers=h, json={
            "schedule": {"mass_unit": "lb", "arm_unit": "in", "empty_arm": 39.0},
            "source": "x",
        })
        check("A13 PUT schedule missing empty_mass -> 400", bad_sched.status_code == 400,
              f"got {bad_sched.status_code}")


def main() -> None:
    run_engine_cases()
    run_api_cases()
    print(f"\n{PASS} passed, {FAIL} failed")
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
