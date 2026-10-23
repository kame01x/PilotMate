"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRole, getToken } from "@/lib/api";
import { canUseLearningLibrary } from "@/lib/roles";
import Library from "@/components/student/Library";
import PageHeader from "@/components/PageHeader";
import RoleGate from "@/components/RoleGate";

export default function DocumentationPage() {
  const router = useRouter();
  const [role, setRoleState] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    const r = getRole();
    // Client-only storage read on mount (same pattern as /student): one
    // follow-up render, no cascading updates, server HTML stays in sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRoleState(r ?? "guest");
    if (!token || !r) router.push("/login?role=student");
  }, [router]);

  // Nothing role-specific renders until the stored session is read.
  if (role === null) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Checking access…</p>
      </div>
    );
  }

  // No session: the redirect above is in flight.
  if (role === "guest") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Redirecting to sign in…</p>
      </div>
    );
  }

  // Signed in, but not a learning role (e.g. an admin): explain instead of
  // mounting Library, which would call /student/aviation-data and /library/*
  // with a token the backend rejects.
  if (!canUseLearningLibrary(role)) {
    return <RoleGate feature="Documentation" role={role} />;
  }

  return (
    <div data-pattern="low" className="flex min-h-screen flex-col items-center p-8">
      <div className="w-full max-w-3xl">
        <PageHeader title="Documentation" />
        <Library />
      </div>
    </div>
  );
}
