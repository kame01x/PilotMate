"use client";

import FlightSummary from "./FlightSummary";
import StudentIdentity from "./StudentIdentity";

export default function StudentDashboard() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Dashboard</h2>
      <StudentIdentity />
      <FlightSummary />
    </div>
  );
}
