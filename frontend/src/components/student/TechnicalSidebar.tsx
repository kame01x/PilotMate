"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TECHNICAL_CATEGORIES, type Exercise } from "./technicalData";

interface Props {
  selected: Exercise | null;
  onSelect: (exercise: Exercise) => void;
  customExercises: Exercise[];
  onAddCustom: (name: string) => void;
}

export default function TechnicalSidebar({ selected, onSelect, customExercises, onAddCustom }: Props) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => Object.fromEntries(TECHNICAL_CATEGORIES.map((c) => [c.id, true])));
  const [customInput, setCustomInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const q = search.toLowerCase().trim();

  function toggleCategory(id: string) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function addCustom() {
    const name = customInput.trim();
    if (!name) return;
    const exists = [...TECHNICAL_CATEGORIES.flatMap((c) => c.exercises), ...customExercises].some(
      (e) => e.name.toLowerCase() === name.toLowerCase()
    );
    if (exists) return;
    onAddCustom(name);
    setCustomInput("");
  }

  const sidebar = (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Exercise Library</h3>
        <Button variant="ghost" size="sm" className="md:hidden" onClick={() => setSidebarOpen(false)}>
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </Button>
      </div>

      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search exercises…" />

      <div className="flex flex-col gap-1">
        {TECHNICAL_CATEGORIES.map((cat) => {
          const isCollapsed = collapsed[cat.id];
          const filtered = cat.exercises.filter(
            (e) => !q || e.name.toLowerCase().includes(q) || cat.name.toLowerCase().includes(q)
          );
          if (q && filtered.length === 0) return null;
          return (
            <div key={cat.id}>
              <button
                onClick={() => toggleCategory(cat.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-accent"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d={cat.iconPath} />
                </svg>
                <span className="flex-1">{cat.name}</span>
                <svg viewBox="0 0 24 24" className={`h-3 w-3 fill-none stroke-current transition-transform ${isCollapsed ? "" : "rotate-90"}`} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
              </button>
              {!isCollapsed && (
                <div className="ml-4 flex flex-col gap-0.5">
                  {filtered.map((ex) => (
                    <button
                      key={ex.id}
                      onClick={() => { onSelect(ex); setSidebarOpen(false); }}
                      className={`rounded-md px-3 py-2 text-left text-sm transition-colors ${
                        selected?.id === ex.id
                          ? "border-l-2 border-primary bg-primary/10 text-primary"
                          : "text-sidebar-foreground/80 hover:bg-accent hover:text-sidebar-foreground"
                      }`}
                    >
                      {ex.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {customExercises.length > 0 && (
          <div>
            <button
              onClick={() => toggleCategory("custom")}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-accent"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
              <span className="flex-1">Custom Exercises</span>
              <svg viewBox="0 0 24 24" className={`h-3 w-3 fill-none stroke-current transition-transform ${collapsed["custom"] ? "" : "rotate-90"}`} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
            {!collapsed["custom"] && (
              <div className="ml-4 flex flex-col gap-0.5">
                {customExercises.map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => { onSelect(ex); setSidebarOpen(false); }}
                    className={`rounded-md px-3 py-2 text-left text-sm transition-colors ${
                      selected?.id === ex.id
                        ? "border-l-2 border-secondary bg-secondary/10 text-secondary"
                        : "text-sidebar-foreground/80 hover:bg-accent hover:text-sidebar-foreground"
                    }`}
                  >
                    {ex.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-auto border-t pt-3">
        <p className="mb-2 text-xs text-muted-foreground">Add custom exercise</p>
        <div className="flex gap-2">
          <Input
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustom()}
            placeholder="Topic name…"
            className="h-8 text-sm"
          />
          <Button variant="outline" size="sm" onClick={addCustom} disabled={!customInput.trim()}>
            Add
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <Button variant="outline" size="sm" className="md:hidden" onClick={() => setSidebarOpen(true)}>
        <svg viewBox="0 0 24 24" className="mr-1 inline h-4 w-4 fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
        Exercises
      </Button>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed left-0 top-0 z-50 h-full max-h-full w-60 flex-shrink-0 overflow-y-auto border-r border-sidebar-border bg-card transition-transform md:static md:z-auto md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebar}
      </aside>
    </>
  );
}
