"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, setRole, setToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Role = "student" | "instructor" | "admin";

const ROLE_LABELS: Record<Role, string> = {
  student: "Student",
  instructor: "Instructor",
  admin: "Admin",
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const paramRole = params.get("role");
  const initialRole: Role =
    paramRole === "instructor" ? "instructor" : paramRole === "admin" ? "admin" : "student";
  const [role, setRoleState] = useState<Role>(initialRole);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch(`/auth/${role}/login`, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(data.access_token);
      setRole(role);
      router.push(role === "admin" ? "/admin" : "/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-96">
      <CardHeader><CardTitle>Log in — {ROLE_LABELS[role]}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
            <Button key={r} variant={role === r ? "default" : "outline"} onClick={() => setRoleState(r)}>
              {ROLE_LABELS[r]}
            </Button>
          ))}
        </div>
        <div><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" /></div>
        <div><Label>Password</Label><Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" /></div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={submit} disabled={loading}>{loading ? "Logging in…" : "Log in"}</Button>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="auth-backdrop flex min-h-screen items-center justify-center p-8">
      <Suspense><LoginForm /></Suspense>
    </main>
  );
}
