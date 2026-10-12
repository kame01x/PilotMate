"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRole, getToken, setRole, setToken } from "@/lib/api";
import Shell, { type SidebarItem } from "@/components/Shell";
import LinkStudent from "@/components/instructor/LinkStudent";
import Messages from "@/components/instructor/Messages";
import PreflightTool from "@/components/instructor/PreflightTool";

const INSTRUCTOR_ITEMS: SidebarItem[] = [
  { id: "link", label: "Link Student", iconPath: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" },
  { id: "messages", label: "Messages", iconPath: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" },
  { id: "preflight", label: "Pre-flight Agent", iconPath: "M22 2 11 13 M22 2l-7 20-4-9-9-4 20-7z" },
];

export default function InstructorDashboard() {
  const router = useRouter();
  const [view, setView] = useState("link");

  useEffect(() => {
    if (!getToken() || getRole() !== "instructor") router.push("/login?role=instructor");
  }, [router]);

  function logout() {
    setToken(null);
    setRole(null);
    router.push("/");
  }

  return (
    <Shell title="Instructor" items={INSTRUCTOR_ITEMS} active={view} onSelect={setView} onLogout={logout}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col items-center gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">Instructor Dashboard</h1>
        </div>
        <div className="w-full max-w-3xl">
          <div className={view === "link" ? "" : "hidden"}><LinkStudent onLinked={() => {}} /></div>
          <div className={view === "messages" ? "" : "hidden"}><Messages /></div>
          <div className={view === "preflight" ? "" : "hidden"}><PreflightTool /></div>
        </div>
      </div>
    </Shell>
  );
}
