"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRole, getToken, setRole, setToken, studentRouteAccess } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Shell, { STUDENT_ITEMS } from "@/components/Shell";
import StudentDashboard from "@/components/student/StudentDashboard";
import Preflight from "@/components/student/Preflight";
import Technical from "@/components/student/Technical";
import Debrief from "@/components/student/Debrief";
import Billing from "@/components/student/Billing";

export default function StudentPage() {
  const router = useRouter();
  const [view, setView] = useState("dashboard");
  const [role, setRoleState] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    const r = getRole();
    // Client-only storage read on mount: exactly one follow-up render, no
    // cascading updates. Required so the server HTML (no localStorage) and the
    // first client render match, instead of reading localStorage during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRoleState(r);
    if (studentRouteAccess(token, r) === "login") router.push("/login?role=student");
  }, [router]);

  function logout() {
    setToken(null);
    setRole(null);
    router.push("/");
  }

  // Nothing session-specific renders until the stored session is read, so a
  // non-student never sees the learning interface even for one frame.
  if (role === null) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Checking access…</p>
      </div>
    );
  }

  // Signed in, but not a student: refuse entry with an explanation instead of
  // bouncing to the login form. The session is left untouched — no logout, no
  // redirect, and no student component (or backend call) is ever rendered.
  if (role !== "student") {
    return (
      <main className="auth-backdrop flex min-h-screen items-center justify-center p-8">
        <Card className="w-96">
          <CardHeader><CardTitle>Student session required</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              A student session is required to open the Student area — it is the student learning workspace.
              You&apos;re signed in as {role}.
            </p>
            <Button onClick={() => router.push(role === "admin" ? "/admin" : "/dashboard")}>Back to PilotMate</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <Shell title="Student" items={STUDENT_ITEMS} active={view} onSelect={setView} onLogout={logout}>
      <div className={view === "technical" || view === "debrief" ? "hidden" : ""}>
        <div className="mx-auto w-full max-w-3xl">
          <div className={view === "dashboard" ? "" : "hidden"}><StudentDashboard /></div>
          <div className={view === "preflight" ? "" : "hidden"}><Preflight /></div>
          <div className={view === "billing" ? "" : "hidden"}><Billing /></div>
        </div>
      </div>
      <div data-pattern={view === "technical" ? "low" : undefined} className={view === "technical" || view === "debrief" ? "flex min-h-0 min-w-0 flex-1 flex-col" : "hidden"}>
        <div className={view === "technical" ? "flex min-h-0 flex-1" : "hidden"}><Technical /></div>
        <div className={view === "debrief" ? "flex min-h-0 flex-1" : "hidden"}><Debrief /></div>
      </div>
    </Shell>
  );
}
