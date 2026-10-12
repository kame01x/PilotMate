"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getRole, getToken } from "@/lib/api";
import Library from "@/components/student/Library";
import PageHeader from "@/components/PageHeader";

export default function DocumentationPage() {
  const router = useRouter();
  const role = getRole();

  useEffect(() => {
    if (!getToken() || !role) router.push("/login");
  }, [router, role]);

  return (
    <div data-pattern="low" className="flex min-h-screen flex-col items-center p-8">
      <div className="w-full max-w-3xl">
        <PageHeader title="Documentation" />
        <Library />
      </div>
    </div>
  );
}
