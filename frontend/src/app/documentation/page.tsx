"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRole, getToken, setRole, setToken } from "@/lib/api";
import { canUseLearningLibrary } from "@/lib/roles";
import Library from "@/components/student/Library";
import Shell, { itemsWithHrefs } from "@/components/Shell";
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

  function logout() {
    setToken(null);
    setRole(null);
    router.push("/");
  }

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
    <Shell items={itemsWithHrefs(role)} active="" onLogout={logout}>
      <div data-pattern="low" className="flex flex-1 flex-col items-center">
        <div className="w-full max-w-3xl">
          <h1 className="mb-6 text-2xl font-bold">Documentation</h1>
          <Library />
        </div>
      </div>
    </Shell>
  );
}
