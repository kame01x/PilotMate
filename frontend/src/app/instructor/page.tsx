"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRole, getToken, setRole, setToken } from "@/lib/api";
import Shell, { INSTRUCTOR_ITEMS } from "@/components/Shell";
import MyStudents from "@/components/instructor/MyStudents";
import Messages from "@/components/instructor/Messages";
import PreflightTool from "@/components/instructor/PreflightTool";

export default function InstructorDashboard() {
  const router = useRouter();
  const [view, setView] = useState("my-students");

  useEffect(() => {
    if (!getToken() || getRole() !== "instructor") router.push("/login?role=instructor");
    const requestedView = new URLSearchParams(window.location.search).get("view");
    if (requestedView && INSTRUCTOR_ITEMS.some((item) => item.id === requestedView)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setView(requestedView);
    }
  }, [router]);

  function logout() {
    setToken(null);
    setRole(null);
    router.push("/");
  }

  return (
    <Shell items={INSTRUCTOR_ITEMS} active={view} onSelect={setView} onLogout={logout}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">Instructor Dashboard</h1>
        </div>
        <div className="w-full max-w-3xl">
          <div className={view === "my-students" ? "" : "hidden"}><MyStudents /></div>
          <div className={view === "messages" ? "" : "hidden"}><Messages /></div>
          <div className={view === "preflight" ? "" : "hidden"}><PreflightTool /></div>
        </div>
      </div>
    </Shell>
  );
}
