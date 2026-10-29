"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRole, getToken, setRole, setToken } from "@/lib/api";
import Shell, { type SidebarItem } from "@/components/Shell";
import MyStudents from "@/components/instructor/MyStudents";
import Messages from "@/components/instructor/Messages";
import PreflightTool from "@/components/instructor/PreflightTool";

const INSTRUCTOR_ITEMS: SidebarItem[] = [
  { id: "my-students", label: "My Students", iconPath: "M12 12v9 M12 7a2 2 0 11-4 0 2 2 0 114 0z M12 12a2 2 0 11-4 0 2 2 0 114 0z" },
  { id: "messages", label: "Messages", iconPath: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 01 2-2h14a2 2 0 01 2 2z" },
  { id: "preflight", label: "Pre-flight Agent", iconPath: "M22 2 11 13 M22 2l-7 20-4-9-9-4 20-7z" },
];

export default function InstructorDashboard() {
  const router = useRouter();
  const [view, setView] = useState("my-students");

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
          <div className={view === "my-students" ? "" : "hidden"}><MyStudents /></div>
          <div className={view === "messages" ? "" : "hidden"}><Messages /></div>
          <div className={view === "preflight" ? "" : "hidden"}><PreflightTool /></div>
        </div>
      </div>
    </Shell>
  );
}
