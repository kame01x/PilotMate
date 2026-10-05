# PilotMate — Architecture & Data Model

## Overview

PilotMate is a 4-part training assistant for student pilots and instructors.

- **Part 1 — Student**: pre-flight prep, technical/maneuver coaching, debrief (with instructor chat)
- **Part 2 — Instructor**: feedback chat, access to pre-flight tools, student linking by ID
- **Part 3 — Documentation library**: aircraft manuals (POH, checklists, etc.) + general reference docs
- **Part 4 — Exam prep**: PPL / ATPL / Know Your Aircraft — placeholder buttons only for v1 ("under construction")

**Core safety principle (applies everywhere):** the app prepares and assists. The student/instructor always verifies and holds full responsibility for any data used in an actual flight. Every safety-relevant output (weather, NOTAM, mass & balance, flight plan) must visibly state this and link to the official source.

---

## User roles

- **Student** — has a unique Student ID, a profile (name, school, home airport, authority/country), flight history, and an optional linked Instructor.
- **Instructor** — has a unique Instructor ID, a profile, and a list of linked students.

## Core data entities

```
Student
 - student_id (unique)
 - name
 - school
 - country
 - authority (EASA / FAA / other)
 - home_airport
 - linked_instructor_id (nullable)

Instructor
 - instructor_id (unique)
 - name
 - school
 - linked_students: [student_id, ...]

Flight
 - flight_id
 - student_id
 - date
 - departure_airport
 - destination_airport (nullable, if cross-country)
 - route
 - aircraft_type
 - exercise_type (e.g. stall, slow flight, landing)
 - runway_surface (grass / concrete) — confirmed per flight, not reused from profile
 - controlled (yes/no) — confirmed per flight
 - flight_rules (VFR / IFR)

PreflightPackage (tied to one Flight)
 - mass_and_balance
 - flight_plan
 - metar_taf
 - notam_summary (+ source link)
 - active_areas (+ time windows, + source link)
 - charts_links
 - frequencies
 - document_checklist (student self-ticked)

Debrief (tied to one Flight)
 - student_id
 - instructor_notes (nullable in v1 — placeholder for future instructor integration)
 - student_reported_feedback
 - agent_conversation_log
 - identified_weak_points
 - coaching_notes

InstructorMessage
 - from_id, to_id (student_id or instructor_id)
 - timestamp
 - message_text
 - read_status
```

**Why this matters now:** even though Part 2 (instructor) and the Debrief→Instructor-notes link are not fully built in v1, this schema is designed so connecting them later means *adding a read, not redesigning the database*.

---

## Agent architecture (Part 1 — Student)

```
                         Student
                            |
                    [ Main Router Agent ]
                    (also reachable via
                     direct buttons)
            ________________|________________
           |                |                |
   Pre-flight Agent   Technical Agent    Debrief Agent
   (docs, weather,    (theory, video,    (conversational,
   NOTAM, mass&bal,    diagram per        asks questions,
   flight plan)        exercise, open     identifies weak
                        topic)             points)
                                                |
                                      [Instructor Chat]
                                      (only reachable
                                       from Debrief)
```

- **Routing**: free-form chat → router agent classifies intent (pre-flight / technical / debrief). Buttons → bypass the router, call the specialist directly.
- **Language**: selected explicitly by the student at the start, not auto-detected.
- **Memory**: conversation-level memory within a session; flight history persists long-term (requires real database, not `InMemorySaver`).

## Data sources (Pre-flight Agent)

| Data | Source | Method |
|---|---|---|
| METAR/TAF | aviationweather.gov (FAA/NOAA) | Direct API — free, no key, worldwide |
| Airport basics (runway, frequencies) | Aviowiki Open Data | Free API/token, CC BY 4.0 |
| NOTAM / active areas | Each country's official AIS/self-briefing site | Web search tool (`@tool` + Tavily), since no free worldwide structured API exists |
| Mass & balance reference | Aircraft POH reference data (by model) | Agent provides typical values; student confirms actual load |
| Flight plan | Student-provided route, or agent-suggested (checked against active/restricted areas) | Agent + NOTAM/active-area data combined |

## Human-in-the-loop verification pattern (applies throughout)

The agent may cross-check student input against a real data source and flag mismatches ("you selected grass, but public data shows concrete — please confirm"), but **never auto-overrides** the student's selection. Final confirmation is always a manual student action.

---

## Part 2 — Instructor (v1 scope)

- Own chat window (feedback on students)
- Button to access the Pre-flight Agent (same logic as Part 1, reused)
- Field to add a student by Student ID (linking mechanism)
- Deferred to later: detailed reports, logbook generation, full student file view

## Part 3 — Documentation library (v1 scope)

- Browse by aircraft type/model/year → POH, checklists, weight & balance sheet
- General section (not aircraft-specific): AIP reference, ICAO Doc 8400, radiotelephony phraseology, chart legend reference

## Part 4 — Exam prep (v1 scope)

- Three buttons: PPL, ATPL, Know Your Aircraft
- All show "Under construction" — structure only, no content yet

---

## Security principles (carried from Phase 2 planning)

- `.env` for all secrets, `.gitignore` excludes it from day one (done)
- No real user data in test/demo code
- Every AI-facing prompt avoids sending passwords or other students' private data
- Student/instructor authentication must be real (not the toy plaintext demo pattern) before any real user data is stored
- STRIDE threat review before building authentication and the instructor-chat feature specifically, since those are the highest-risk areas (spoofing a student/instructor identity, information disclosure between users)
