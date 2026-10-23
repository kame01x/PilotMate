"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";
import MusicPlayer from "@/components/music/MusicPlayer";

export type SidebarItem = { id: string; label: string; iconPath: string };

export const STUDENT_ITEMS: SidebarItem[] = [
  { id: "dashboard", label: "Dashboard", iconPath: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10" },
  { id: "preflight", label: "Pre-flight", iconPath: "M22 2 11 13 M22 2l-7 20-4-9-9-4 20-7z" },
  { id: "technical", label: "Technical", iconPath: "M22 12h-4l-3 9L9 3l-3 9H2z" },
  { id: "debrief", label: "Debriefing", iconPath: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" },
  { id: "billing", label: "Billing", iconPath: "M2 8h20v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z M2 8l2-4h16l2 4M12 14v2" },
];

export default function Shell({
  title,
  items,
  active,
  onSelect,
  children,
  onLogout,
}: {
  title: string;
  items: SidebarItem[];
  active: string;
  onSelect: (id: string) => void;
  children: React.ReactNode;
  onLogout: () => void;
}) {
  const router = useRouter();
  return (
    <div className="flex h-screen flex-col sm:flex-row">
      <aside className="flex w-full flex-col gap-2 overflow-y-auto border-b border-sidebar-border bg-sidebar p-4 sm:w-64 sm:flex-shrink-0 sm:border-b-0 sm:border-r">
        <div className="mb-2 flex items-center justify-between px-2">
          <h2 className="text-lg font-bold text-sidebar-foreground">PilotMate</h2>
          <ThemeToggle />
        </div>
        <MusicPlayer />
        <nav className="flex flex-row gap-2 overflow-x-auto sm:flex-col sm:gap-4 sm:overflow-x-visible">
          {items.map((item) => {
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelect(item.id)}
                className={`flex shrink-0 items-center gap-3 whitespace-nowrap rounded-md px-4 py-3 text-left text-base transition-colors ${
                  isActive
                    ? "border-l-4 border-secondary bg-secondary/10 text-secondary"
                    : "text-sidebar-foreground/80 hover:bg-accent hover:text-sidebar-foreground"
                }`}
              >
                <svg viewBox="0 0 24 24" className={`h-5 w-5 fill-none ${isActive ? "stroke-current" : "stroke-sidebar-icon"}`} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d={item.iconPath} />
                </svg>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-row gap-2 pt-2 sm:flex-col">
          <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => router.push("/dashboard")}>
            <svg viewBox="0 0 24 24" className="mr-1 inline h-4 w-4 fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Main Dashboard
          </Button>
          <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={onLogout}>Log out</Button>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto p-8 pl-8 pr-4">
        {children}
      </main>
    </div>
  );
}
