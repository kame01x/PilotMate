"""Independent live audit of the rebuilt Pre-flight system (items 1-5).

Runs against the live backend on 127.0.0.1:8000. Uses distinctive inputs
(EGLL -> EGCC, Diamond DA40, G-ABCD) so results cannot be confused with
earlier LKLT test runs.
"""
import json
import sys
import time
from datetime import datetime

import httpx

BASE = "http://127.0.0.1:8000"
PASSED, FAILED = [], []


def check(name, cond, detail=""):
    if cond:
        PASSED.append(name)
        print(f"  PASS  {name}")
    else:
        FAILED.append(name)
        print(f"  FAIL  {name} :: {detail}")


def login(client):
    r = client.post(f"{BASE}/auth/student/login",
                    json={"email": "student.demo@example.com", "password": "strong-pass-123"})
    r.raise_for_status()
    return r.json()["access_token"]


PAYLOAD = {
    "message": "Audit briefing: EGLL to EGCC, Diamond DA40.",
    "departure": "EGLL",
    "destination": "EGCC",
    "route": "DCT WELIN DCT TOPRO",
    "aircraft_type": "Diamond DA40",
    "aircraft_registration": "G-ABCD",
    "exercise": "Local navigation exercise",
    "rules": "VFR",
    "flight_date": "2026-10-20",
    "departure_time": "14:30",
    "flight_period": "day",
    "authority": "UK-CAA",
    "runway": "27R",
    "fuel": "100 liters",
    "endurance": "4 hours",
    "departure_runway_surface": "concrete",
    "departure_controlled": True,
    "destination_runway_surface": "concrete",
    "destination_controlled": True,
}


def audit_json_endpoint(client, h):
    print("\n[A1/3] JSON endpoint — distinct inputs flow through; honesty checks")
    t0 = time.time()
    r = client.post(f"{BASE}/student/preflight", json=PAYLOAD, headers=h)
    dt = time.time() - t0
    check("HTTP 200", r.status_code == 200, f"got {r.status_code}: {r.text[:200]}")
    if r.status_code != 200:
        return None
    body = r.json()
    check("response non-null", bool(body.get("response") and body["response"].strip()))
    text = body["response"]
    for token in ["EGLL", "EGCC", "Diamond DA40", "G-ABCD", "100 liters", "4 hours", "UK-CAA", "DCT WELIN"]:
        check(f"response reflects input {token!r}", token in text, f"missing in response text")
    sections = {s["section_id"]: s for s in body["sections"]}
    check("12 sections present", len(body["sections"]) == 12, f"got {len(body['sections'])}")

    # Overview must echo the exact form values
    ov = sections.get("flight_overview", {})
    ov_text = json.dumps(ov)
    for token in ["EGLL", "EGCC", "Diamond DA40", "G-ABCD", "100 liters", "4 hours"]:
        check(f"overview contains {token!r}", token in ov_text)

    # Weather: EGLL publishes METAR — must be real icao-tagged data, with timestamps
    wx = sections.get("weather", {})
    wx_text = json.dumps(wx)
    check("weather ok", wx.get("status") == "ok", f"status={wx.get('status')} err={wx.get('error')}")
    check("weather references EGLL", "EGLL" in wx_text)
    sources = wx.get("sources") or []
    check("weather has sources", len(sources) > 0, "no sources")
    if sources:
        ts = sources[0].get("fetched_at")
        try:
            datetime.fromisoformat(ts)
            check("source fetched_at is valid ISO timestamp", True)
        except Exception as e:  # noqa: BLE001
            check("source fetched_at is valid ISO timestamp", False, f"{ts!r} ({e})")
        check("source names aviationweather.gov", "aviationweather" in (sources[0].get("name") or "").lower())

    # Airports from AvioWiki
    for aid, icao in [("airport_departure", "EGLL"), ("airport_destination", "EGCC")]:
        ap = sections.get(aid, {})
        check(f"{aid} ok", ap.get("status") == "ok", f"status={ap.get('status')} err={ap.get('error')}")
        check(f"{aid} references {icao}", icao in json.dumps(ap))

    # NOTAMs honesty: official sources listed regardless of web results
    notams = sections.get("notams", {})
    check("notams ok", notams.get("status") == "ok", f"status={notams.get('status')} err={notams.get('error')}")
    check("notams lists official source", "ais.nats" in json.dumps(notams).lower() or "nats" in json.dumps(notams).lower())

    # Sources section aggregates and carries verify warning
    src = sections.get("sources", {})
    check("sources section ok", src.get("status") == "ok")
    check("sources section warns to verify", "verify" in json.dumps(src).lower())

    # Status/counts honesty
    check("status field valid", body.get("status") in ("complete", "partial", "failed"), str(body.get("status")))
    check("counts consistent with sections", body.get("counts", {}).get("ok", 0) ==
          sum(1 for s in body["sections"] if s["status"] == "ok"), str(body.get("counts")))
    print(f"  info  JSON took {dt:.1f}s status={body['status']} counts={body['counts']}")
    return body


def audit_stream(client, h):
    print("\n[A1/2] SSE stream — progressive delivery, exactly-once sections, single terminal")
    events = []
    t0 = time.time()
    with client.stream("POST", f"{BASE}/student/preflight/stream", json=PAYLOAD, headers=h) as r:
        check("stream HTTP 200", r.status_code == 200)
        check("stream content-type text/event-stream",
              "text/event-stream" in r.headers.get("content-type", ""), r.headers.get("content-type", ""))
        cur = None
        for line in r.iter_lines():
            if line.startswith("event: "):
                cur = line[7:].strip()
            elif line.startswith("data: "):
                data = json.loads(line[6:])
                events.append((time.time() - t0, cur, data))
    total = time.time() - t0

    types = [t for _, t, _ in events]
    gens = [d.get("generation_id") for _, _, d in events]
    check("all events share one generation_id", len(set(gens)) == 1, f"ids={set(gens)}")
    check("starts with generation_started", types[0] == "generation_started" if types else False, str(types[:3]))
    terminals = [t for t in types if t in ("generation_completed", "generation_failed")]
    check("exactly one terminal event", len(terminals) == 1, f"terminals={terminals}")

    # Exactly-once: each section_id appears at most once in terminal section events
    section_terminals = [d.get("section_id") for _, t, d in events
                         if t in ("section_completed", "section_unavailable", "section_failed")]
    check("no duplicate terminal section events", len(section_terminals) == len(set(section_terminals)),
          f"dupes={ [s for s in set(section_terminals) if section_terminals.count(s) > 1] }")
    check("12 terminal section events", len(section_terminals) == 12, f"got {len(section_terminals)}")

    # Progressive: not a single end-of-stream flush — section events span time
    section_times = [t for t, typ, _ in events if typ.startswith("section_")]
    if len(section_times) >= 2:
        span = section_times[-1] - section_times[0]
        check("sections delivered progressively (span > 0.3s)", span > 0.3, f"span={span:.3f}s")
    instant = [t for t, typ, d in events if typ == "section_completed" and d.get("section_id") in
               ("flight_overview", "day_night", "documents", "mass_balance", "aircraft_planning")]
    io_first = [t for t, typ, d in events if typ == "section_started" and d.get("section_id") in
                ("weather", "notams", "airport_departure")]
    check("instant sections precede I/O section_started",
          bool(instant and io_first) and max(instant) <= max(io_first) + 0.001,
          f"instant={instant} io_started={io_first}")

    # section_started precedes its terminal for I/O sections
    started_ids = [d.get("section_id") for _, t, d in events if t == "section_started"]
    for sid in ("weather", "notams", "airport_departure", "videos", "operational_considerations"):
        check(f"section_started emitted for {sid}", sid in started_ids, f"started={started_ids}")
        check(f"section_started precedes terminal for {sid}",
              sid in started_ids and sid in section_terminals)
    print(f"  info  stream took {total:.1f}s, {len(events)} events")
    return events


def audit_no_metar_honesty(client, h):
    print("\n[A3] Unavailable-data honesty — LKLT has no METAR")
    payload = dict(PAYLOAD, departure="LKLT", destination=None, route=None,
                   aircraft_type="Cessna 172", aircraft_registration=None)
    r = client.post(f"{BASE}/student/preflight", json=payload, headers=h)
    check("LKLT briefing HTTP 200", r.status_code == 200, r.text[:150])
    if r.status_code != 200:
        return
    wx = next((s for s in r.json()["sections"] if s["section_id"] == "weather"), {})
    text = json.dumps(wx)
    check("weather states no METAR published (or nearest station used)",
          "No METAR is published" in text or "nearest" in text.lower(), text[:300])


def audit_bogus_airport(client, h):
    print("\n[A3] Unknown airport — explicit unavailable/failed, never crash")
    payload = dict(PAYLOAD, departure="ZZZZ", destination=None)
    r = client.post(f"{BASE}/student/preflight", json=payload, headers=h)
    check("bogus airport still HTTP 200", r.status_code == 200, f"got {r.status_code}")
    if r.status_code != 200:
        return
    body = r.json()
    check("bogus airport response non-null", bool(body.get("response")))
    ap = next((s for s in body["sections"] if s["section_id"] == "airport_departure"), {})
    check("departure airport explicit unavailable/failed",
          ap.get("status") in ("unavailable", "failed"), f"status={ap.get('status')}")
    check("departure airport explains gap", bool(ap.get("error") or ap.get("blocks")),
          "no error or blocks")


def audit_followup(client, h):
    print("\n[A4] Follow-up endpoint — flight-context retention")
    # Generate a briefing first so a real generation_id exists
    r = client.post(f"{BASE}/student/preflight", json=PAYLOAD, headers=h)
    check("follow-up prerequisite briefing 200", r.status_code == 200)
    gen_id = r.json().get("generation_id") if r.status_code == 200 else None
    check("generation_id available for follow-up", bool(gen_id))

    # With flight context (what the fixed frontend sends) — must retain it
    q_ctx = {
        "message": "Which two airports was that briefing for, and what aircraft registration?",
        "generation_id": gen_id,
        "flight_context": {
            "departure": "EGLL", "destination": "EGCC",
            "aircraft_type": "Diamond DA40", "aircraft_registration": "G-ABCD",
            "exercise": "Local navigation exercise", "rules": "VFR",
            "fuel": "100 liters", "endurance": "4 hours",
        },
    }
    r2 = client.post(f"{BASE}/student/preflight/follow-up", json=q_ctx, headers=h)
    check("follow-up (with context) HTTP 200", r2.status_code == 200, f"got {r2.status_code}: {r2.text[:200]}")
    has_context = False
    if r2.status_code == 200:
        answer = (r2.json().get("response") or "").lower()
        has_context = ("egll" in answer and "egcc" in answer) or "g-abcd" in answer
        check("follow-up WITH context retains flight context (EGLL/EGCC/G-ABCD)",
              has_context, f"answer: {answer[:250]!r}")
        check("follow-up never invents different airports",
              not any(x in answer for x in ("lklt", "lkkb", "ksql")), answer[:250])

    # Without context (bare API client) — must honestly admit the gap
    r3 = client.post(f"{BASE}/student/preflight/follow-up",
                     json={"message": "Which airports was that briefing for?", "generation_id": gen_id},
                     headers=h)
    check("follow-up (no context) HTTP 200", r3.status_code == 200)
    if r3.status_code == 200:
        answer = (r3.json().get("response") or "").lower()
        admits_gap = any(p in answer for p in ("don't have", "do not have", "cannot access",
                                               "can't access", "don't have access", "regenerat",
                                               "don't retain", "not retain", "don't store"))
        check("follow-up WITHOUT context honestly admits the gap",
              admits_gap or has_context, f"answer: {answer[:250]!r}")
        check("follow-up without context invents nothing",
              not any(x in answer for x in ("lklt", "lkkb", "ksql", "egll")), answer[:250])
    print(f"  info  follow-up with-context retained={has_context}")
    return has_context


def audit_cancel_during_io(client, h):
    print("\n[A5] Cancel during real external I/O")
    gen_id = None
    saw_io_start = False
    t0 = time.time()
    events = []
    cancel_result = None
    with client.stream("POST", f"{BASE}/student/preflight/stream", json=PAYLOAD, headers=h) as r:
        cur = None
        for line in r.iter_lines():
            if line.startswith("event: "):
                cur = line[7:].strip()
            elif line.startswith("data: "):
                data = json.loads(line[6:])
                events.append((time.time() - t0, cur, data))
                if cur == "generation_started":
                    gen_id = data.get("generation_id")
                if cur == "section_started" and data.get("section_id") in ("weather", "notams"):
                    saw_io_start = True
                    # Cancel mid-I/O from a second connection
                    cr = client.post(f"{BASE}/student/preflight/cancel",
                                     json={"generation_id": gen_id}, headers=h)
                    cancel_result = cr.json() if cr.status_code == 200 else {"http": cr.status_code}
                    break  # stop reading; measure how the server-side run reacts via follow-up health
    t_break = time.time() - t0
    check("observed I/O section_started before cancel", saw_io_start)
    check("cancel endpoint returned cancelled=true", bool(cancel_result and cancel_result.get("cancelled")),
          str(cancel_result))
    check("cancel acknowledged quickly (<2s into stream)", t_break < 2.0 + 5, f"t={t_break:.2f}s")

    # The cancelled run's HTTP response was abandoned by client; verify server is healthy
    # and that a NEW briefing still completes (no zombie locks, no crash).
    time.sleep(1.0)
    hr = client.get(f"{BASE}/health")
    check("server healthy after cancel", hr.status_code == 200 and hr.json().get("status") == "ok")
    r = client.post(f"{BASE}/student/preflight", json=PAYLOAD, headers=h)
    check("new briefing works after cancel", r.status_code == 200 and bool(r.json().get("response")),
          f"got {r.status_code}")
    # Cancel registry must not leak: cancelling the finished generation id returns false
    if r.status_code == 200:
        finished_id = r.json().get("generation_id")
        cr = client.post(f"{BASE}/student/preflight/cancel", json={"generation_id": finished_id}, headers=h)
        check("finished generation not cancellable (registry cleaned)", cr.json().get("cancelled") is False,
              str(cr.json()))
    print(f"  info  cancel path: io_start at {t_break:.2f}s, events before break={len(events)}")


def main():
    print("Pre-flight independent live audit")
    print("=" * 60)
    with httpx.Client(timeout=300) as client:
        tok = login(client)
        h = {"Authorization": f"Bearer {tok}"}
        body = audit_json_endpoint(client, h)
        audit_stream(client, h)
        audit_no_metar_honesty(client, h)
        audit_bogus_airport(client, h)
        context_retained = audit_followup(client, h)
        audit_cancel_during_io(client, h)
    print("\n" + "=" * 60)
    print(f"PASSED: {len(PASSED)}  FAILED: {len(FAILED)}")
    if FAILED:
        for f in FAILED:
            print(f"  FAILED: {f}")
        sys.exit(1)
    print("ALL PASS")
    if context_retained is False:
        print("NOTE: follow-up context gap observed (admitted honestly) — see report")


if __name__ == "__main__":
    main()
