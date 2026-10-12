"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Flight {
  id: number;
  flight_id: string;
  date: string;
  departure_airport: string;
  destination_airport: string | null;
  aircraft_type: string | null;
  exercise_type: string | null;
  flight_rules: string | null;
}

export default function FlightSummary() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/student/flights")
      .then((data) => {
        setFlights(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground">Loading flight summary…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;

  const totalFlights = flights.length;
  const lastFlight = flights.length > 0 ? [...flights].sort((a, b) => (a.date < b.date ? 1 : -1))[0] : null;
  const recentFlights = [...flights].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Total Flights</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{totalFlights}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Last Flight</CardTitle></CardHeader>
          <CardContent>
            {lastFlight ? (
              <p className="text-sm font-medium">{lastFlight.exercise_type || "—"}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No flights yet</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Aircraft</CardTitle></CardHeader>
          <CardContent>
            {lastFlight?.aircraft_type ? (
              <p className="text-sm font-medium">{lastFlight.aircraft_type}</p>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent Flights</CardTitle></CardHeader>
        <CardContent>
          {recentFlights.length === 0 ? (
            <p className="text-sm text-muted-foreground">No flights recorded yet.</p>
          ) : (
            <ul className="divide-y">
              {recentFlights.map((f) => (
                <li key={f.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-medium">{f.flight_id}</span>
                  <span className="text-muted-foreground">
                    {f.date?.slice(0, 10)} · {f.exercise_type || "—"} · {f.aircraft_type || "—"} · {f.departure_airport} → {f.destination_airport ?? "local"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
