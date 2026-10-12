"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AiBlocks } from "@/components/AiBlocks";
import type { BriefingSection } from "@/lib/preflightStream";

const SECTION_ORDER = [
  "flight_overview",
  "operational_considerations",
  "weather",
  "airport_departure",
  "airport_destination",
  "notams",
  "mass_balance",
  "aircraft_planning",
  "day_night",
  "documents",
  "videos",
  "sources",
];

function statusBadge(status: BriefingSection["status"]) {
  switch (status) {
    case "ok":
      return <Badge variant="outline" className="border-primary/50 text-primary">Ready</Badge>;
    case "unavailable":
      return <Badge variant="outline" className="border-caution/50 text-caution">Unavailable</Badge>;
    case "failed":
      return <Badge variant="outline" className="border-destructive/50 text-destructive">Failed</Badge>;
    default:
      return null;
  }
}

export default function BriefingReport({
  sections,
  pendingSectionIds,
  status,
  counts,
  notice,
  error,
  onCancel,
  onRetry,
  followUp,
}: {
  sections: Record<string, BriefingSection>;
  pendingSectionIds: string[];
  status: "complete" | "partial" | "failed" | null;
  counts: Record<string, number> | null;
  notice: string | null;
  error: string | null;
  onCancel: () => void;
  onRetry: () => void;
  followUp?: React.ReactNode;
}) {
  const ordered = SECTION_ORDER.filter((id) => sections[id]);
  // Any section not in SECTION_ORDER still shows (future-proof)
  for (const id of Object.keys(sections)) {
    if (!ordered.includes(id)) ordered.push(id);
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Pre-flight Briefing Report</h2>
        <div className="flex items-center gap-2">
          {(status === null || pendingSectionIds.length > 0) && (
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
          {(status === "failed" || error) && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            Download PDF
          </Button>
        </div>
      </div>

      {status && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            Status:{" "}
            <span className={status === "complete" ? "text-primary" : status === "partial" ? "text-caution" : "text-destructive"}>
              {status}
            </span>
          </span>
          {counts && (
            <span>
              ({counts.ok ?? 0} ready · {counts.unavailable ?? 0} unavailable · {counts.failed ?? 0} failed)
            </span>
          )}
        </div>
      )}

      {notice && (
        <div className="rounded-sm border border-caution/40 bg-caution/10 px-3 py-2 text-sm text-caution">
          <Badge variant="outline" className="mr-2 border-caution/50 text-caution">Notice</Badge>
          {notice}
        </div>
      )}

      {error && (
        <div className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {ordered.map((id) => {
          const section = sections[id];
          return (
            <Card key={id} className={section.status === "failed" ? "border-destructive/40" : section.status === "unavailable" ? "border-caution/40" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span>{section.title}</span>
                  {statusBadge(section.status)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {section.status === "failed" && section.error && (
                  <p className="text-destructive">Data unavailable — {section.error}</p>
                )}
                {section.status === "unavailable" && section.blocks.length === 0 && (
                  <p className="text-muted-foreground">No data available for this section.</p>
                )}
                <AiBlocks blocks={section.blocks} />
                {section.notice && section.status === "ok" && (
                  <p className="mt-2 text-xs text-muted-foreground">{section.notice}</p>
                )}
              </CardContent>
            </Card>
          );
        })}

        {pendingSectionIds.length > 0 && (
          <Card className="border-dashed">
            <CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
              Working on: {pendingSectionIds.join(", ")}…
            </CardContent>
          </Card>
        )}
      </div>

      {status && status !== "failed" && followUp}
    </div>
  );
}
