"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  ClipboardCheck,
  MessageSquareText,
  Send,
  Sparkles,
} from "lucide-react";
import { apiFetch, getRole, getToken, setRole, setToken } from "@/lib/api";
import { dashboardCards, requiresStudentSession, type ModuleCardProps } from "@/lib/dashboard-cards";
import Shell, { ProfileAvatar, itemsWithHrefs, useShellProfile } from "@/components/Shell";
import AnswerView from "@/components/answer/AnswerView";

interface ChatTurn {
  role: string;
  text: string;
}

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

const QUICK_PROMPTS = [
  "How do I handle a crosswind landing?",
  "Explain the stall recovery",
  "Which documents do I need to fly?",
];

const ROLE_LABEL: Record<string, string> = {
  student: "Student",
  instructor: "Instructor",
  admin: "Administrator",
};

function firstName(name: string | undefined): string {
  const value = (name ?? "").trim();
  if (!value) return "Pilot";
  return value.split(/\s+/)[0];
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function ModuleCard({ title, description, iconPath, onOpen }: ModuleCardProps & { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${title}`}
      className="group relative flex min-h-[176px] flex-col items-start gap-3.5 rounded-2xl border border-border bg-card p-6 text-left shadow-[0_2px_12px_rgba(31,80,170,0.08)] transition duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_8px_22px_rgba(31,80,170,0.16)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[14px] bg-primary/10 text-primary">
        <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] fill-none stroke-current" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={iconPath} />
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block text-[19px] font-bold leading-tight text-foreground">{title}</span>
        <span className="mt-1.5 block max-w-[340px] text-sm leading-relaxed text-muted-foreground">{description}</span>
      </span>
      <ArrowUpRight className="absolute right-[22px] top-6 h-5 w-5 text-primary transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
    </button>
  );
}

function TrainingSnapshot({
  isStudent,
  loading,
  summary,
  identityName,
  identityRole,
  identityIdentifier,
  moduleCount,
}: {
  isStudent: boolean;
  loading: boolean;
  summary: DashboardSummary | null;
  identityName?: string;
  identityRole?: string;
  identityIdentifier?: string;
  moduleCount: number;
}) {
  const lastFlight = summary?.flights.last_flight ?? null;
  const percent = summary?.training.percent ?? 0;
  const stats = isStudent
    ? [
        { value: loading ? "..." : String(summary?.flights.total ?? 0), label: "Total flights" },
        { value: loading ? "..." : `${percent}%`, label: "Progress" },
        {
          value: loading ? "..." : lastFlight?.aircraft_type ?? "Not recorded",
          label: lastFlight?.flight_id ?? "Latest aircraft",
        },
      ]
    : [
        { value: String(moduleCount), label: "Modules available" },
        { value: identityRole ?? "Account", label: "Signed in as" },
        { value: identityIdentifier ?? identityName ?? "PilotMate", label: "Account ID" },
      ];

  return (
    <aside className="pm-dashboard-snapshot flex min-h-[360px] flex-col gap-3 overflow-hidden rounded-2xl border border-border p-6 shadow-[0_2px_12px_rgba(31,80,170,0.08)]" aria-label="Training snapshot">
      <div>
        <h2 className="text-[17px] font-bold text-foreground">Train smart. Fly safe.</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">Your lessons, documents and exam prep in one place.</p>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center py-3">
        <svg viewBox="0 0 240 200" className="h-full max-h-[250px] w-full max-w-[260px]" role="img" aria-label="Attitude indicator illustration">
          <defs>
            <clipPath id="pm-horizon-clip">
              <circle cx="120" cy="92" r="74" />
            </clipPath>
            <linearGradient id="pm-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#8dbafa" />
              <stop offset="1" stopColor="#5d96e8" />
            </linearGradient>
          </defs>
          <circle cx="120" cy="92" r="84" fill="#ffffff" stroke="#9db9e6" strokeWidth="2" />
          <g clipPath="url(#pm-horizon-clip)">
            <g transform="rotate(-8 120 92)">
              <rect x="20" y="-30" width="200" height="122" fill="url(#pm-sky)" />
              <rect x="20" y="92" width="200" height="120" fill="#3a6ac4" />
              <path d="M20 92H220" stroke="#ffffff" strokeWidth="2.5" />
              <g stroke="#ffffff" strokeWidth="2" strokeLinecap="round">
                <path d="M100 70H140M108 54H132M100 113H140M108 129H132" />
              </g>
            </g>
          </g>
          <circle cx="120" cy="92" r="74" fill="none" stroke="#9db9e6" />
          <path d="M78 92H102M138 92H162" stroke="#f5a623" strokeWidth="5" strokeLinecap="round" />
          <circle cx="120" cy="92" r="4.5" fill="#f5a623" />
          <g stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.95">
            <path d="M101 99L120 92L139 99L120 116Z" />
            <path d="M114 96L120 92L126 96" />
          </g>
          <g fill="#3a6ac4">
            <circle cx="52" cy="171" r="24" fill="#ffffff" stroke="#9db9e6" strokeWidth="2" />
            <circle cx="52" cy="171" r="19" fill="#f1f6ff" />
            <path d="M64 162L60 166M68 173L63 174M59 182L56 179M49 185L49 181M40 181L42 177M36 172L41 171" stroke="#3a6ac4" strokeWidth="2" strokeLinecap="round" />
            <path d="M52 171L58 160" stroke="#f5a623" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="52" cy="171" r="2.5" />
          </g>
          <g fill="#3a6ac4" fontSize="7" fontWeight="700" textAnchor="middle">
            <text x="52" y="146">ALT</text>
          </g>
        </svg>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0 rounded-[10px] border border-border bg-card/80 px-2.5 py-2">
            <p className="truncate text-[15px] font-bold leading-tight text-foreground" title={stat.value}>{stat.value}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const profile = useShellProfile();
  const [role, setRoleState] = useState<string | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [greetingText, setGreetingText] = useState("Welcome back");

  useEffect(() => {
    const r = getRole();
    setRoleState(r);
    if (!getToken() || !r) {
      router.push("/login");
      return;
    }
    // Time-of-day copy is intentionally client-only so the static shell can
    // render before the browser's clock is available.
    setGreetingText(greeting());
  }, [router]);

  useEffect(() => {
    if (role !== "student") return;
    let cancelled = false;
    apiFetch("/student/dashboard-summary")
      .then((data: DashboardSummary) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingSummary(false);
      });
    return () => {
      cancelled = true;
    };
  }, [role]);

  function logout() {
    setToken(null);
    setRole(null);
    router.push("/");
  }

  function openModule(href: string) {
    if (requiresStudentSession(href, role)) {
      setNotice(
        role
          ? `A student session is required to open the Student area. You're signed in as ${role} — sign in with a student account to open it.`
          : "A student session is required to open the Student area. Sign in with a student account to open it.",
      );
      return;
    }
    setNotice(null);
    router.push(href);
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || loading) return;
    setTurns((current) => [...current, { role: "user", text: message }]);
    setInput("");
    setLoading(true);
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
      setLoading(false);
    }
  }

  const cards: ModuleCardProps[] = dashboardCards(role);
  const isStudent = role === "student";
  const displayName = summary?.name ?? profile?.identity?.name;
  const studentId = summary?.student_id ?? profile?.identity?.identifier;

  return (
    <div className="student-workspace-bg student-dashboard-view min-h-screen sm:h-screen">
      <Shell
        items={itemsWithHrefs(role)}
        active={isStudent ? "dashboard" : ""}
        onLogout={logout}
        contentClassName="p-0"
      >
        <div className="student-dashboard-surface pm-dashboard mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-[18px] px-5 py-6 lg:px-[34px]">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground sm:text-[28px]">
                {greetingText}, {firstName(displayName)}
              </h1>
              <p className="mt-1.5 text-[15px] text-muted-foreground">
                Keep training. Your next flight is a step closer.
              </p>
              {isStudent && summary?.linked_instructor && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Instructor: {summary.linked_instructor.name} ({summary.linked_instructor.instructor_id})
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              {studentId && (
                <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2">
                  <div>
                    <p className="text-[11px] text-muted-foreground">Student ID</p>
                    <p className="text-[13px] font-bold text-foreground">{studentId}</p>
                  </div>
                  <ClipboardCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                </div>
              )}
              <ProfileAvatar size="lg" className="border-2 border-white shadow-[0_2px_12px_rgba(31,80,170,0.14)]" />
            </div>
          </header>

          {notice && (
            <div role="status" className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-[0_2px_12px_rgba(31,80,170,0.08)]">
              <div className="flex items-start justify-between gap-3">
                <p>{notice}</p>
                <button type="button" onClick={() => setNotice(null)} className="shrink-0 font-semibold text-primary hover:underline">
                  Dismiss
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => router.push(role === "admin" ? "/admin" : "/dashboard")} className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
                  Go to {role === "admin" ? "admin dashboard" : "dashboard"}
                </button>
                <button type="button" onClick={() => router.push("/login?role=student")} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
                  Sign in as student
                </button>
              </div>
            </div>
          )}

          <section aria-label="Dashboard modules" className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {role !== null &&
              cards.map((card) => (
                <ModuleCard key={card.title} {...card} onOpen={() => openModule(card.href)} />
              ))}
          </section>

          <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
            <section className="flex min-h-[390px] flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-[0_2px_12px_rgba(31,80,170,0.08)] sm:p-7" aria-label="Ask Anything">
              <div className="flex items-start gap-3.5">
                <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[14px] bg-primary/10 text-primary">
                  <MessageSquareText className="h-[22px] w-[22px]" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[20px] font-bold leading-tight text-foreground">Ask Anything</h2>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    Type your aviation question. The router will classify it and hand it to the right agent.
                  </p>
                </div>
              </div>

              <div className="flex min-h-[120px] flex-1 flex-col gap-3 overflow-y-auto rounded-[14px] border border-border bg-muted/50 p-4">
                <div className="max-w-[78%] self-start rounded-2xl rounded-bl-[4px] border border-border bg-card px-4 py-3 text-[14px] leading-relaxed text-foreground">
                  <b>Hi {firstName(displayName)}!</b> Ask me anything about techniques, procedures, regulations or exams. I will send your question to the right specialist.
                </div>
                {turns.map((turn, index) => (
                  <div key={index} className={turn.role === "user" ? "max-w-[78%] self-end" : "max-w-[78%] self-start"}>
                    <div className={turn.role === "user"
                      ? "rounded-2xl rounded-br-[4px] bg-primary px-4 py-3 text-[14px] text-primary-foreground"
                      : "rounded-2xl rounded-bl-[4px] border border-border bg-card px-4 py-3 text-[14px] text-foreground"}
                    >
                      {turn.role === "user" ? <p className="whitespace-pre-wrap">{turn.text}</p> : <AnswerView text={turn.text} />}
                    </div>
                  </div>
                ))}
                {loading && <p className="self-start text-sm text-muted-foreground">Thinking...</p>}
              </div>

              {turns.length === 0 && (
                <div className="flex flex-wrap gap-2">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void send(prompt)}
                      className="rounded-full bg-muted px-3.5 py-[7px] text-[13px] font-medium text-foreground transition hover:bg-accent"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-2.5">
                <label htmlFor="dashboard-question" className="sr-only">Your aviation question</label>
                <input
                  id="dashboard-question"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void send(input);
                  }}
                  placeholder="Type your aviation question here..."
                  className="h-[54px] min-w-0 flex-1 rounded-xl border border-input bg-card px-4 text-[15px] text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => void send(input)}
                  disabled={loading || !input.trim()}
                  className="flex h-[54px] shrink-0 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send
                  <Send className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </section>

            <TrainingSnapshot
              isStudent={isStudent}
              loading={loadingSummary}
              summary={summary}
              identityName={profile?.identity?.name}
              identityRole={role ? ROLE_LABEL[role] : undefined}
              identityIdentifier={profile?.identity?.identifier}
              moduleCount={cards.length}
            />
          </div>

          <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Answers are training guidance, not a substitute for your instructor or official publications.
          </p>
        </div>
      </Shell>
    </div>
  );
}
