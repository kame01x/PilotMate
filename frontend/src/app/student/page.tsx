"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRole, getToken, setRole, setToken } from "@/lib/api";
import Shell, { STUDENT_ITEMS } from "@/components/Shell";
import StudentDashboard from "@/components/student/StudentDashboard";
import Preflight from "@/components/student/Preflight";
import Technical from "@/components/student/Technical";
import Debrief from "@/components/student/Debrief";

export default function StudentPage() {
  const router = useRouter();
  const [view, setView] = useState("dashboard");

  useEffect(() => {
    if (!getToken() || getRole() !== "student") router.push("/login?role=student");
  }, [router]);

  function logout() {
    setToken(null);
    setRole(null);
    router.push("/");
  }

  return (
    <Shell title="Student" items={STUDENT_ITEMS} active={view} onSelect={setView} onLogout={logout}>
      <div className={view === "technical" || view === "debrief" ? "hidden" : ""}>
        <div className="mx-auto w-full max-w-3xl">
          <div className={view === "dashboard" ? "" : "hidden"}><StudentDashboard /></div>
          <div className={view === "preflight" ? "" : "hidden"}><Preflight /></div>
        </div>
      </div>
      <div data-pattern={view === "technical" ? "low" : undefined} className={view === "technical" || view === "debrief" ? "flex min-h-0 min-w-0 flex-1 flex-col" : "hidden"}>
        <div className={view === "technical" ? "flex min-h-0 flex-1" : "hidden"}><Technical /></div>
        <div className={view === "debrief" ? "flex min-h-0 flex-1" : "hidden"}><Debrief /></div>
      </div>
    </Shell>
  );
}
