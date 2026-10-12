"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRole, getToken, apiFetch } from "@/lib/api";
import SidebarList, { type SidebarListItem } from "@/components/student/SidebarList";
import ExamPrep from "@/components/student/ExamPrep";

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
  const role = getRole();
  const [sections, setSections] = useState<string[]>(DEFAULT_SECTIONS);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken() || !role) router.push("/login");
  }, [router, role]);

  useEffect(() => {
    apiFetch("/exam-prep/sections")
      .then((data) => {
        if (Array.isArray(data?.sections) && data.sections.length > 0) {
          setSections(data.sections);
        }
      })
      .catch(() => {});
  }, []);

  const items: SidebarListItem[] = sections.map((s) => ({ id: s, label: s }));

  return (
    <div className="flex h-screen">
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
