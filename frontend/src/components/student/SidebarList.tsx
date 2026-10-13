"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";
import MusicPlayer from "@/components/music/MusicPlayer";

export interface SidebarListItem {
  id: string;
  label: string;
}

export default function SidebarList({
  title,
  items,
  selectedId,
  onSelect,
  actionLabel = "Main menu",
  actionHref = "/dashboard",
}: {
  title: string;
  items: SidebarListItem[];
  selectedId: string | null;
  onSelect: (item: SidebarListItem) => void;
  actionLabel?: string;
  actionHref?: string;
}) {
  const router = useRouter();
  return (
    <aside className="flex h-full w-64 flex-shrink-0 flex-col gap-3 overflow-y-auto border-r border-sidebar-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between px-2">
        <h2 className="text-lg font-bold text-sidebar-foreground">{title}</h2>
          <ThemeToggle />
        </div>
        <MusicPlayer />

        <div className="flex flex-col gap-1">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            className={`rounded-md px-3 py-2 text-left text-sm transition-colors ${
              selectedId === item.id
                ? "border-l-2 border-primary bg-primary/10 text-primary"
                : "text-sidebar-foreground/80 hover:bg-accent hover:text-sidebar-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-auto border-t pt-3">
        <Button variant="outline" size="sm" onClick={() => router.push(actionHref)}>
          <svg viewBox="0 0 24 24" className="mr-1 inline h-4 w-4 fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          {actionLabel}
        </Button>
      </div>
    </aside>
  );
}
