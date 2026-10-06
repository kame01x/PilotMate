"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export default function History() {
  const [flights, setFlights] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/student/flights")
      .then(setFlights)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (flights.length === 0) return <p className="text-sm text-muted-foreground">No flights recorded yet.</p>;
  const sorted = [...flights].sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <ul className="divide-y rounded-md border">
      {sorted.map((f) => (
        <li key={f.flight_id} className="flex justify-between px-3 py-2 text-sm">
          <span className="font-medium">{f.flight_id}</span>
          <span className="text-muted-foreground">{f.date?.slice(0, 10)} · {f.exercise_type} · {f.aircraft_type} · {f.departure_airport} → {f.destination_airport ?? "local"}</span>
        </li>
      ))}
    </ul>
  );
}
