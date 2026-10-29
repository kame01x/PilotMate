"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import LinkStudent from "./LinkStudent";

type StudentRow = { student_id: string; name: string; home_airport: string };

export default function MyStudents() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/instructor/students")
      .then((data) => {
        if (cancelled) return;
        setStudents(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load your students");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">My Students</h2>
        <p className="text-sm text-muted-foreground">
          Students you have linked. Use the link form below to add another student.
        </p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading your students...</p> : null}
      {!loading && !error && students.length === 0 ? <p className="text-sm text-muted-foreground">No students linked yet.</p> : null}
      {students.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {students.map((s) => (
            <li key={s.student_id} className="rounded-lg border border-border p-3 text-sm">
              <span className="font-medium">{s.name}</span>
              <span className="ml-2 font-mono text-muted-foreground">({s.student_id})</span>
              {s.home_airport ? <div className="mt-1 text-xs text-muted-foreground">Home airport: {s.home_airport}</div> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-col gap-2 max-w-md">
        <h3 className="text-lg font-semibold">Link Student</h3>
        <LinkStudent onLinked={refresh} />
      </div>
    </section>
  );
}
