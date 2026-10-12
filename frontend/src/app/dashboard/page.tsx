"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRole, getToken, setToken, setRole, apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ThemeToggle from "@/components/ThemeToggle";

interface ModuleCardProps {
  title: string;
  description: string;
  iconPath: string;
  href: string;
}

function ModuleCard({ title, description, iconPath, href }: ModuleCardProps) {
  const router = useRouter();
  return (
    <Card
      className="w-64 cursor-pointer transition-all hover:border-primary hover:shadow-lg"
      onClick={() => router.push(href)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") router.push(href); }}
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

  const cards: ModuleCardProps[] = role === "student"
    ? [
        { title: "Student", description: "Manage your flight training and learning activities.", iconPath: "M22 10v6M2 10l10-5 10 5-10 5z M6 12v5c0 1.6 2.7 3 6 3s6-1.4 6-3v-5", href: "/student" },
        { title: "Documentation", description: "Access aviation documents and reference materials.", iconPath: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z", href: "/documentation" },
        { title: "Exams", description: "Prepare for aviation examinations and review your knowledge.", iconPath: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8", href: "/exams" },
      ]
    : [
        { title: "Instructor", description: "Access your instructor workspace and training tools.", iconPath: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75", href: "/instructor" },
        { title: "Exams", description: "Prepare for aviation examinations and review your knowledge.", iconPath: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8", href: "/exams" },
        { title: "Documentation", description: "Access aviation documents and reference materials.", iconPath: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z", href: "/documentation" },
      ];

  return (
    <div className="flex min-h-screen flex-col items-center gap-8 p-8">
      <div className="flex w-full max-w-4xl items-center justify-between">
        <h1 className="text-2xl font-bold">PilotMate</h1>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button onClick={logout} className="text-sm text-muted-foreground hover:text-foreground">Log out</button>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-6">
        {role !== null &&
          cards.map((card) => (
            <ModuleCard key={card.title} {...card} />
          ))}
      </div>

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
                  <div className={turn.role === "user" ? "rounded-md bg-primary px-3 py-2 text-primary-foreground" : "rounded-md border border-border bg-card px-3 py-2"}>
                    <p className="text-sm whitespace-pre-wrap">{turn.text}</p>
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
