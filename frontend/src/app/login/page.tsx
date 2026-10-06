"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, setRole, setToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const initialRole = params.get("role") === "instructor" ? "instructor" : "student";
  const [role, setRoleState] = useState<"student" | "instructor">(initialRole);
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
      router.push(role === "student" ? "/student" : "/instructor");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-96">
      <CardHeader><CardTitle>Log in — {role === "student" ? "Student" : "Instructor"}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Button variant={role === "student" ? "default" : "outline"} onClick={() => setRoleState("student")}>Student</Button>
          <Button variant={role === "instructor" ? "default" : "outline"} onClick={() => setRoleState("instructor")}>Instructor</Button>
        </div>
        <div><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" /></div>
        <div><Label>Password</Label><Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" /></div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button onClick={submit} disabled={loading}>{loading ? "Logging in…" : "Log in"}</Button>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Suspense><LoginForm /></Suspense>
    </main>
  );
}
