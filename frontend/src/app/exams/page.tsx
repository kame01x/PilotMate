"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRole, getToken, apiFetch } from "@/lib/api";
import { canUseLearningLibrary } from "@/lib/roles";
import SidebarList, { type SidebarListItem } from "@/components/student/SidebarList";
import ExamPrep from "@/components/student/ExamPrep";
import RoleGate from "@/components/RoleGate";

const DEFAULT_SECTIONS = [
  "PPL",
  "ATPL",
  "CPL",
  "Boeing Exam",
  "Airbus Exam",
  "Private Jet",
  "Know Your Aircraft",
];

export default function ExamsPage() {
  const router = useRouter();
  const [role, setRoleState] = useState<string | null>(null);
  const [sections, setSections] = useState<string[]>(DEFAULT_SECTIONS);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    const r = getRole();
    // Client-only storage read on mount (same pattern as /student): one
    // follow-up render, no cascading updates, server HTML stays in sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRoleState(r ?? "guest");
    if (!token || !r) router.push("/login?role=student");
  }, [router]);

  // Fetch sections only for a role that may use them — never with an admin or
  // unknown token (the backend would answer 403).
  useEffect(() => {
    if (!role || !canUseLearningLibrary(role)) return;
    apiFetch("/exam-prep/sections")
      .then((data) => {
        if (Array.isArray(data?.sections) && data.sections.length > 0) {
          setSections(data.sections);
        }
      })
      .catch(() => {});
  }, [role]);

  // Nothing role-specific renders until the stored session is read.
  if (role === null) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Checking access…</p>
      </div>
    );
  }

  // No session: the redirect above is in flight.
  if (role === "guest") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Redirecting to sign in…</p>
      </div>
    );
  }

  // Signed in, but not a learning role (e.g. an admin): explain instead of
  // mounting ExamPrep, which would call /exam-prep/* with a token the backend
  // rejects.
  if (!canUseLearningLibrary(role)) {
    return <RoleGate feature="Exams" role={role} />;
  }

  const items: SidebarListItem[] = sections.map((s) => ({ id: s, label: s }));

  return (
    <div className="flex h-screen flex-col sm:flex-row">
      <SidebarList
        title="Exam Prep"
        items={items}
        selectedId={selected}
        onSelect={(item) => setSelected(item.id)}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto p-8 pl-8 pr-4">
        <ExamPrep selected={selected} />
      </main>
    </div>
  );
}
