"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type LinkedInstructor = { instructor_id: string; name: string };

type StudentIdentity = {
  student_id: string;
  name: string;
  linked_instructor: LinkedInstructor | null;
};

export default function StudentIdentity() {
  const [identity, setIdentity] = useState<StudentIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/student/me")
      .then((data) => {
        if (!cancelled) setIdentity(data);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load student identity");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function copyId() {
    if (!identity?.student_id) return;
    try {
      await navigator.clipboard.writeText(identity.student_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Copy failed - please select the Student ID manually.");
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Student ID</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !identity ? (
          <p className="text-sm text-muted-foreground">Loading your Student ID...</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-mono font-semibold">{identity.student_id}</span>
              <Button variant="outline" size="sm" onClick={copyId} disabled={copied}>
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    Copy ID
                  </>
                )}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">Student name: {identity.name}</p>
            {identity.linked_instructor ? (
              <p className="text-sm text-muted-foreground">
                Linked instructor: {identity.linked_instructor.name} ({identity.linked_instructor.instructor_id})
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No instructor linked yet.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
