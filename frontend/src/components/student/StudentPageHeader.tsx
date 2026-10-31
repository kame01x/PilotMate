"use client";

import { ProfileAvatar, useShellProfile } from "@/components/Shell";

const TEXT = "#0f2a5c";
const MUTED = "#3f5580";
const BORDER = "#d6e3f6";

function StudentIdIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#1f6bf5"
      strokeWidth="2"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M14 10h4M14 14h4M6 16c.7-1.5 4.3-1.5 6 0" />
    </svg>
  );
}

export default function StudentPageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  const profile = useShellProfile();
  const studentId = profile?.identity?.identifier;

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold sm:text-[26px]" style={{ color: TEXT }}>
          {title}
        </h1>
        <p className="mt-1 text-sm" style={{ color: MUTED }}>
          {subtitle}
        </p>
      </div>

      <div className="flex items-center gap-2.5 sm:gap-3">
        <div
          className="flex items-center gap-2.5 rounded-xl border bg-white px-3.5 py-[7px]"
          style={{ borderColor: BORDER }}
        >
          <div>
            <p className="text-[11px]" style={{ color: "#55698f" }}>Student ID</p>
            <p className="text-[13px] font-bold" style={{ color: TEXT }}>
              {studentId ?? "Loading"}
            </p>
          </div>
          <StudentIdIcon />
        </div>
        <ProfileAvatar
          size="lg"
          className="border-2 border-white shadow-[0_2px_12px_rgba(31,80,170,0.14)]"
        />
      </div>
    </header>
  );
}
