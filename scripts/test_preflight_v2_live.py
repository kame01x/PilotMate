import json
import sys
import time

import httpx

BASE = "http://127.0.0.1:8000"

def login(client):
    r = client.post(f"{BASE}/auth/student/login",
                    json={"email": "student.demo@example.com", "password": "strong-pass-123"})
    r.raise_for_status()
    return r.json()["access_token"]

def main():
    with httpx.Client(timeout=300) as client:
        tok = login(client)
        h = {"Authorization": f"Bearer {tok}"}

        # 1. JSON endpoint
        payload = {
            "message": "Pre-flight briefing please",
            "departure": "LKLT",
            "destination": "LKKB",
            "aircraft_type": "Cessna 172",
            "exercise": "cross-country",
            "rules": "VFR",
            "flight_date": "2026-10-15",
            "departure_time": "10:00",
            "flight_period": "day",
        }
        t0 = time.time()
        r = client.post(f"{BASE}/student/preflight", json=payload, headers=h)
        dt = time.time() - t0
        print(f"JSON: {r.status_code} in {dt:.1f}s")
        if r.status_code != 200:
            print(r.text[:500]); sys.exit(1)
        body = r.json()
        assert body.get("response"), "response is null/empty"
        print(f"  status={body['status']} notice={body['notice']!r} chars={len(body['response'])} counts={body['counts']}")
        for s in body["sections"]:
            print(f"  - {s['section_id']}: {s['status']} ({len(s['blocks'])} blocks)")

        # 2. SSE stream endpoint
        t0 = time.time()
        events = []
        with client.stream("POST", f"{BASE}/student/preflight/stream", json=payload, headers=h) as r:
            print(f"STREAM: {r.status_code}")
            assert r.status_code == 200
            cur_event = None
            for line in r.iter_lines():
                if line.startswith("event: "):
                    cur_event = line[7:].strip()
                elif line.startswith("data: "):
                    data = json.loads(line[6:])
                    events.append((cur_event, data))
                    if cur_event == "generation_completed":
                        print(f"  completed status={data.get('status')} counts={data.get('counts')}")
                    elif cur_event == "generation_failed":
                        print(f"  FAILED: {data.get('error')}")
                    elif cur_event in ("section_completed", "section_unavailable", "section_failed"):
                        sec = data.get("section") or {}
                        print(f"  {cur_event}: {sec.get('section_id')} [{sec.get('status')}]")
        dt = time.time() - t0
        types = [e for e, _ in events]
        print(f"  stream events={len(events)} in {dt:.1f}s types={sorted(set(types))}")
        assert "generation_started" in types, "missing generation_started"
        assert "generation_completed" in types or "generation_failed" in types, "missing terminal event"
        assert "section_completed" in types, "no sections completed"

        # 3. cancel endpoint (unknown id -> cancelled:false, not an error)
        r = client.post(f"{BASE}/student/preflight/cancel", json={"generation_id": "pf-nonexistent"}, headers=h)
        print(f"CANCEL: {r.status_code} {r.json()}")
        assert r.status_code == 200

        # 4. invalid request -> 422, not 200-null
        r = client.post(f"{BASE}/student/preflight", json={"message": "x"}, headers=h)
        print(f"INVALID (no departure): {r.status_code}")
        assert r.status_code == 422, f"expected 422, got {r.status_code}"

        # 5. suggest-route
        r = client.post(f"{BASE}/student/preflight/suggest-route",
                        json={"departure": "LKLT", "destination": "LKKB", "aircraft_type": "Cessna 172"},
                        headers=h)
        print(f"SUGGEST: {r.status_code} routes={len(r.json().get('routes', []))}")

        print("\nALL PASS")

if __name__ == "__main__":
    main()
