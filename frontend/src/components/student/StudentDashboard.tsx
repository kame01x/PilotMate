"use client";

import FlightSummary from "./FlightSummary";

export default function StudentDashboard() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Dashboard</h2>
      <FlightSummary />
    </div>
  );
}
