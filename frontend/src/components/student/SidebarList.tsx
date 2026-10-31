"use client";

export interface SidebarListItem {
  id: string;
  label: string;
}

export default function SidebarList({
  title,
  items,
  selectedId,
  onSelect,
}: {
  title: string;
  items: SidebarListItem[];
  selectedId: string | null;
  onSelect: (item: SidebarListItem) => void;
}) {
  return (
    <aside className="flex w-full flex-col gap-3 overflow-y-auto border-b border-sidebar-border bg-card p-4 sm:h-full sm:w-64 sm:flex-shrink-0 sm:border-b-0 sm:border-r">
      <div className="mb-2 px-2">
        <h2 className="text-lg font-bold text-sidebar-foreground">{title}</h2>
      </div>
      <div className="flex flex-row gap-1 overflow-x-auto sm:flex-col sm:overflow-x-visible" aria-label="Exam sections">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            aria-current={selectedId === item.id ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm transition-colors ${
              selectedId === item.id
                ? "border-l-2 border-primary bg-primary/10 text-primary"
                : "text-sidebar-foreground/80 hover:bg-accent hover:text-sidebar-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </aside>
  );
}
