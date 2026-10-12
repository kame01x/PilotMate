"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";

export default function PageHeader({ title }: { title: string }) {
  const router = useRouter();
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => router.push("/dashboard")}>
          <svg viewBox="0 0 24 24" className="mr-1 inline h-4 w-4 fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          Main menu
        </Button>
        <ThemeToggle />
      </div>
    </div>
  );
}
