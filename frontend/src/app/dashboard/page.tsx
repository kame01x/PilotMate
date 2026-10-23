"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRole, getToken, setToken, setRole, apiFetch } from "@/lib/api";
import { dashboardCards, requiresStudentSession, type ModuleCardProps } from "@/lib/dashboard-cards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";
import MusicPlayer from "@/components/music/MusicPlayer";
import AnswerView from "@/components/answer/AnswerView";

function ModuleCard({ title, description, iconPath, href, onOpen }: ModuleCardProps & { onOpen?: (href: string) => void }) {
  const router = useRouter();
  const open = () => (onOpen ? onOpen(href) : router.push(href));
  return (
    <Card
      className="w-64 cursor-pointer transition-all hover:border-primary hover:shadow-lg"
      onClick={open}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") open(); }}
      aria-label={`Open ${title}`}
    >
      <CardHeader>
        <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-primary" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d={iconPath} />
          </svg>
        </div>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

interface ChatTurn {
  role: string;
  text: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [role, setRoleState] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const r = getRole();
    setRoleState(r);
    if (!getToken() || !r) router.push("/login");
  }, [router]);

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
    if (!text.trim() || loading) return;
    setTurns((t) => [...t, { role: "user", text }]);
    setInput("");
    setLoading(true);
    try {
      const data = await apiFetch("/student/chat", {
        method: "POST",
        body: JSON.stringify({ message: text }),
      });
      setTurns((t) => [...t, { role: "assistant", text: typeof data.response === "string" ? data.response : JSON.stringify(data.response, null, 2) }]);
    } catch (e: any) {
      setTurns((t) => [...t, { role: "assistant", text: e.message ?? "Something went wrong" }]);
    } finally {
      setLoading(false);
    }
  }

  const cards: ModuleCardProps[] = dashboardCards(role);

  return (
    <div className="flex min-h-screen flex-col items-center gap-8 p-8">
      <div className="flex w-full items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">PilotMate</h1>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => router.push("/")}>
            <svg viewBox="0 0 24 24" className="mr-1 inline h-4 w-4 fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10" /></svg>
            Home
          </Button>
          <button onClick={logout} className="text-sm text-muted-foreground hover:text-foreground">Log out</button>
          <ThemeToggle />
          <MusicPlayer />
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-6">
        {role !== null &&
          cards.map((card) => (
            <ModuleCard key={card.title} {...card} onOpen={openModule} />
          ))}
      </div>

      {notice && (
        <div role="status" className="w-full max-w-2xl rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          <div className="flex items-start justify-between gap-3">
            <p>{notice}</p>
            <button onClick={() => setNotice(null)} className="shrink-0 hover:text-foreground">Dismiss</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => router.push(role === "admin" ? "/admin" : "/dashboard")}>
              Go to {role === "admin" ? "admin dashboard" : "dashboard"}
            </Button>
            <Button size="sm" onClick={() => router.push("/login?role=student")}>
              Sign in as student
            </Button>
          </div>
        </div>
      )}

      <div className="w-full max-w-2xl">
        <div className="mb-4 flex flex-col items-center gap-2">
          <h2 className="text-2xl font-semibold">Ask Anything</h2>
          <p className="text-sm text-muted-foreground">
            Type your aviation question — the router will classify it and hand it to the right agent.
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex flex-col gap-3">
            <div className="flex max-h-80 flex-col gap-2 overflow-y-auto rounded-md border bg-card p-3">
              {turns.length === 0 && <p className="text-sm text-muted-foreground">Type your aviation question here...</p>}
              {turns.map((turn, i) => (
                <div key={i} className={turn.role === "user" ? "self-end max-w-[85%]" : "self-start max-w-[85%]"}>
                  <div className={turn.role === "user" ? "rounded-md bg-primary px-3 py-2 text-primary-foreground" : "rounded-lg border border-border bg-card px-3 py-2.5"}>
                    {turn.role === "user" ? (
                      <p className="text-sm whitespace-pre-wrap">{turn.text}</p>
                    ) : (
                      <AnswerView text={turn.text} />
                    )}
                  </div>
                </div>
              ))}
              {loading && <p className="text-sm text-muted-foreground">Thinking…</p>}
            </div>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send(input)}
                placeholder="Type your aviation question here..."
                className="h-10 flex-1 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring"
              />
              <button onClick={() => send(input)} disabled={loading} className="rounded-lg bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50">
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
