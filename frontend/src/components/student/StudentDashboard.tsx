"use client";

import { useEffect, useState } from "react";
import { Check, CheckCircle2, Clock, Plane } from "lucide-react";
import AnswerView from "@/components/answer/AnswerView";
import { ProfileAvatar, useShellProfile } from "@/components/Shell";
import { apiFetch } from "@/lib/api";

interface DashboardFlight {
  id: number;
  flight_id: string;
  date: string | null;
  departure_airport: string;
  destination_airport: string | null;
  route: string | null;
  aircraft_type: string | null;
  exercise_type: string | null;
  flight_rules: string | null;
  debriefed: boolean;
}

interface DashboardSummary {
  student_id: string;
  name: string;
  linked_instructor: { instructor_id: string; name: string } | null;
  flights: {
    total: number;
    this_month: number;
    last_flight: DashboardFlight | null;
  };
  training: {
    flights_total: number;
    debriefs_completed: number;
    percent: number;
  };
  recent_flights: DashboardFlight[];
}

interface ChatTurn {
  role: string;
  text: string;
}

const TEXT = "#0f2a5c";
const MUTED = "#55698f";
const BORDER = "#d6e3f6";
const CARD_SHADOW = "shadow-[0_2px_12px_rgba(31,80,170,0.07)]";
const CARD_SURFACE = "rounded-[14px] border bg-white/95";
const ICON_TILE = "flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-[#e3eeff] text-[#1f6bf5]";

function PaperPlaneIcon() {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function AircraftIcon() {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v6M3 11l9 2 9-2M12 13v9M8 22h8" />
    </svg>
  );
}

function StudentIdIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1f6bf5" strokeWidth="2">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M14 10h4M14 14h4M6 16c.7-1.5 4.3-1.5 6 0" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
      <path d="M9 11h6M9 14h4" />
    </svg>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "Date not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function routeLabel(flight: DashboardFlight): string {
  if (flight.route) return flight.route;
  return flight.destination_airport
    ? `${flight.departure_airport} to ${flight.destination_airport}`
    : `${flight.departure_airport} local`;
}

function firstName(name: string | undefined): string {
  const value = (name ?? "").trim();
  if (!value) return "Student";
  return value.split(/\s+/)[0];
}

function StatCard({
  label,
  value,
  note,
  icon,
  loading,
  valueClassName = "text-[26px]",
  noteColor = MUTED,
}: {
  label: string;
  value: string | number;
  note: string;
  icon: React.ReactNode;
  loading: boolean;
  valueClassName?: string;
  noteColor?: string;
}) {
  return (
    <div className={`${CARD_SURFACE} ${CARD_SHADOW} flex h-full min-h-[104px] items-center gap-3.5 px-5 py-[18px]`} style={{ borderColor: BORDER }}>
      <span className={ICON_TILE}>{icon}</span>
      <div className="min-w-0">
        <p className="text-xs" style={{ color: MUTED }}>{label}</p>
        <p className={`truncate font-bold leading-[1.15] ${valueClassName}`} style={{ color: TEXT }}>
          {loading ? "..." : value}
        </p>
        <p className="mt-0.5 truncate text-xs" style={{ color: noteColor }}>{loading ? "Loading" : note}</p>
      </div>
    </div>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  return (
    <svg
      role="img"
      aria-label={`${percent} percent complete`}
      width="46"
      height="46"
      viewBox="0 0 46 46"
      className="shrink-0"
    >
      <circle cx="23" cy="23" r={radius} fill="none" stroke="#dbe7fb" strokeWidth="5" />
      <circle
        cx="23"
        cy="23"
        r={radius}
        fill="none"
        stroke="#1f6bf5"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 23 23)"
      />
    </svg>
  );
}

function TrainingProgressCard({
  training,
  loading,
}: {
  training: DashboardSummary["training"];
  loading: boolean;
}) {
  const percent = training.flights_total === 0 ? 0 : training.percent;

  return (
    <div className={`${CARD_SURFACE} ${CARD_SHADOW} flex h-full min-h-[104px] items-center gap-3.5 px-5 py-[18px]`} style={{ borderColor: BORDER }}>
      <ProgressRing percent={percent} />
      <div className="min-w-0 flex-1">
        <p className="text-xs" style={{ color: MUTED }}>Training Progress</p>
        <p className="text-[26px] font-bold leading-[1.15]" style={{ color: TEXT }}>
          {loading ? "..." : `${percent}%`}
        </p>
        <div className="mt-1.5 h-[5px] overflow-hidden rounded-[3px] bg-[#dbe7fb]">
          <div className="h-full rounded-[3px] bg-[#1f6bf5]" style={{ width: `${percent}%` }} />
        </div>
        {!loading && (
          <p className="mt-1 truncate text-[10px]" style={{ color: MUTED }}>
            {training.debriefs_completed} of {training.flights_total} debriefs
          </p>
        )}
      </div>
    </div>
  );
}

function QuoteCard() {
  return (
    <section className={`${CARD_SHADOW} relative min-h-[210px] flex-1 overflow-hidden rounded-[14px] bg-[linear-gradient(180deg,#6fa8ee_0%,#bcd8f7_52%,#f1dcc0_76%,#8aa76d_100%)]`}>
      <svg
        aria-hidden="true"
        width="150"
        height="150"
        viewBox="0 0 160 160"
        className="absolute left-1/2 top-[34px] -ml-[75px] -rotate-[24deg]"
        fill="#0f2a5c"
      >
        <ellipse cx="80" cy="82" rx="7" ry="52" />
        <path d="M80 62L10 76 10 88 80 84 150 88 150 76z" />
        <path d="M80 122L52 132 52 138 80 135 108 138 108 132z" />
        <rect x="62" y="30" width="36" height="3" rx="1.5" />
      </svg>
      <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgba(5,23,69,0)_0%,rgba(5,23,69,0.88)_100%)] px-[18px] pb-4 pt-10">
        <p className="text-sm font-medium leading-snug text-white">
          &ldquo;Better pilots<br />build better tomorrows.&rdquo;
        </p>
        <p className="mt-2.5 text-[13px] font-bold text-white">PilotMate</p>
      </div>
    </section>
  );
}

export default function StudentDashboard() {
  const profile = useShellProfile();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/student/dashboard-summary")
      .then((data: DashboardSummary) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        if (!cancelled) {
          setSummaryError("Dashboard details are unavailable. Refresh the page to try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSummary(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const studentId = summary?.student_id ?? profile?.identity?.identifier ?? "";
  const studentName = summary?.name ?? profile?.identity?.name;
  const instructor = summary?.linked_instructor ?? null;
  const totalFlights = summary?.flights.total ?? 0;
  const thisMonth = summary?.flights.this_month ?? 0;
  const lastFlight = summary?.flights.last_flight ?? null;
  const recentFlights = summary?.recent_flights ?? [];
  const training = summary?.training ?? { flights_total: 0, debriefs_completed: 0, percent: 0 };

  async function copyId() {
    if (!studentId) return;
    try {
      await navigator.clipboard.writeText(studentId);
      setCopyError(null);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopyError("Copy failed - please select the Student ID manually.");
    }
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || sending) return;
    setTurns((current) => [...current, { role: "user", text: message }]);
    setInput("");
    setSending(true);
    try {
      const data = await apiFetch("/student/chat", {
        method: "POST",
        body: JSON.stringify({ message }),
      });
      setTurns((current) => [
        ...current,
        {
          role: "assistant",
          text: typeof data.response === "string" ? data.response : JSON.stringify(data.response, null, 2),
        },
      ]);
    } catch (error: unknown) {
      setTurns((current) => [
        ...current,
        { role: "assistant", text: error instanceof Error ? error.message : "Something went wrong" },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="student-dashboard-surface mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col gap-5 sm:min-h-[calc(100vh-4rem)]">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold sm:text-[26px]" style={{ color: TEXT }}>
            Welcome back, {firstName(studentName)}
          </h1>
          <p className="mt-1 text-sm" style={{ color: MUTED }}>
            Keep building your skills. Every flight and debrief moves you forward.
          </p>
          <p className="mt-1 text-xs" style={{ color: MUTED }}>
            {instructor
              ? `Instructor: ${instructor.name} (${instructor.instructor_id})`
              : "No instructor linked yet."}
          </p>
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="flex items-center gap-2.5 rounded-xl border bg-white px-3.5 py-[7px]" style={{ borderColor: BORDER }}>
            <div>
              <p className="text-[11px]" style={{ color: MUTED }}>Student ID</p>
              <p className="text-[13px] font-bold" style={{ color: TEXT }}>{studentId || "Loading"}</p>
            </div>
            <button
              type="button"
              onClick={copyId}
              disabled={!studentId || copied}
              aria-label={copied ? "Student ID copied" : "Copy Student ID"}
              title={copied ? "Copied" : "Copy Student ID"}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[#1f6bf5] transition hover:bg-[#eaf2ff] disabled:opacity-60"
            >
              {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <StudentIdIcon />}
            </button>
          </div>
          <ProfileAvatar
            size="lg"
            className="border-2 border-white shadow-[0_2px_12px_rgba(31,80,170,0.14)]"
          />
        </div>
      </header>

      {copyError && <p role="alert" className="text-xs text-red-600">{copyError}</p>}
      {summaryError && (
        <p role="status" className="text-xs text-amber-700">
          {summaryError}
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Flights"
          value={totalFlights}
          note={thisMonth > 0 ? `↑ ${thisMonth} this month` : "No flights this month"}
          noteColor={thisMonth > 0 ? "#0b7a4b" : MUTED}
          icon={<PaperPlaneIcon />}
          loading={loadingSummary}
        />
        <StatCard
          label="Last Flight"
          value={lastFlight ? formatDate(lastFlight.date) : "No flights yet"}
          valueClassName="text-[18px] leading-[1.3]"
          note={lastFlight?.exercise_type ?? "Flight date will appear here"}
          icon={<CalendarIcon />}
          loading={loadingSummary}
        />
        <StatCard
          label="Aircraft"
          value={lastFlight?.aircraft_type ?? "Not recorded"}
          valueClassName="text-[18px] leading-[1.3]"
          note={lastFlight ? routeLabel(lastFlight) : "Aircraft will appear here"}
          icon={<AircraftIcon />}
          loading={loadingSummary}
        />
        <TrainingProgressCard training={training} loading={loadingSummary} />
      </div>

      <div className="grid gap-5 lg:grid-cols-4">
        <section className={`${CARD_SURFACE} ${CARD_SHADOW} h-full overflow-hidden lg:col-span-3`} style={{ borderColor: BORDER }}>
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3.5" style={{ borderColor: "#eaf0fa" }}>
              <h2 className="text-sm font-bold" style={{ color: TEXT }}>Recent Flights</h2>
              <span className="text-[11px]" style={{ color: MUTED }}>{recentFlights.length} shown</span>
            </div>
            {loadingSummary ? (
              <p className="px-4 py-6 text-sm" style={{ color: MUTED }}>Loading flights...</p>
            ) : recentFlights.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Plane className="mx-auto h-7 w-7 text-[#9db4d8]" aria-hidden="true" />
                <p className="mt-2 text-sm font-medium" style={{ color: TEXT }}>No flights recorded yet.</p>
                <p className="mt-1 text-xs" style={{ color: MUTED }}>Your recent flights will appear here once your instructor adds them.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead>
                    <tr className="border-b text-[10px] uppercase tracking-wide" style={{ borderColor: "#eaf0fa", color: MUTED }}>
                      <th className="px-4 py-2.5 font-semibold">Date</th>
                      <th className="px-4 py-2.5 font-semibold">Flight</th>
                      <th className="px-4 py-2.5 font-semibold">Route</th>
                      <th className="px-4 py-2.5 font-semibold">Type</th>
                      <th className="px-4 py-2.5 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentFlights.map((flight) => (
                      <tr key={flight.id} className="border-b last:border-0" style={{ borderColor: "#f0f4fb" }}>
                        <td className="whitespace-nowrap px-4 py-3" style={{ color: MUTED }}>{formatDate(flight.date)}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold" style={{ color: TEXT }}>{flight.flight_id}</p>
                          <p className="mt-0.5 text-[11px]" style={{ color: MUTED }}>{flight.aircraft_type ?? "Aircraft not recorded"}</p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3" style={{ color: MUTED }}>{routeLabel(flight)}</td>
                        <td className="px-4 py-3" style={{ color: MUTED }}>{flight.exercise_type ?? "Not recorded"}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${
                            flight.debriefed ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                          }`}>
                            {flight.debriefed ? (
                              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                            ) : (
                              <Clock className="h-3 w-3" aria-hidden="true" />
                            )}
                            {flight.debriefed ? "Debriefed" : "Pending debrief"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </section>

        <div className="flex h-full min-w-0 flex-col lg:col-span-1">
          <QuoteCard />
        </div>
      </div>

      <div className="mt-auto pt-10 sm:pt-14">
      <section className={`${CARD_SURFACE} ${CARD_SHADOW} flex items-start gap-4 px-5 py-4`} style={{ borderColor: BORDER }}>
        <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-[#e3eeff] text-[#1f6bf5]">
          <ChatIcon />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold" style={{ color: TEXT }}>Ask Anything</h2>

          {turns.length > 0 && (
            <div className="mt-2.5 flex max-h-64 flex-col gap-2 overflow-y-auto rounded-xl border border-[#eaf0fa] bg-[#f8fbff] p-3">
              {turns.map((turn, index) => (
                <div key={index} className={turn.role === "user" ? "self-end max-w-[88%]" : "self-start max-w-[88%]"}>
                  <div className={turn.role === "user"
                    ? "rounded-xl bg-[#1f6bf5] px-3 py-2 text-xs text-white"
                    : "rounded-xl border border-[#e2eaf6] bg-white px-3 py-2.5"}
                  >
                    {turn.role === "user" ? <p className="whitespace-pre-wrap">{turn.text}</p> : <AnswerView text={turn.text} />}
                  </div>
                </div>
              ))}
              {sending && <p className="text-xs" style={{ color: MUTED }}>Thinking...</p>}
            </div>
          )}

          <div className="mt-2 flex gap-2.5">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void send(input);
              }}
              placeholder="Type your question about flight training, procedures or aircraft..."
              aria-label="Ask a question"
              className="h-11 min-w-0 flex-1 rounded-[10px] border border-[#c9d9f1] bg-[#f7faff] px-3.5 text-[13px] outline-none transition focus:border-[#1f6bf5]"
              style={{ color: TEXT }}
            />
            <button
              type="button"
              onClick={() => void send(input)}
              disabled={sending || !input.trim()}
              aria-label="Send question"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-[#1f6bf5] text-white transition hover:bg-[#155bd8] disabled:opacity-50"
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13" />
                <path d="M22 2l-7 20-4-9-9-4z" />
              </svg>
            </button>
          </div>
        </div>
      </section>
      </div>
    </div>
  );
}
