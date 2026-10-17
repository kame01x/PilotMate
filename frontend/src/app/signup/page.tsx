"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const initialRole = params.get("role") === "instructor" ? "instructor" : "student";
  const [role, setRoleState] = useState<"student" | "instructor">(initialRole);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [school, setSchool] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      await apiFetch(`/auth/${role}/signup`, {
        method: "POST",
        body: JSON.stringify({ name, email, password, school: school || null, invite_code: inviteCode.trim() }),
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <Card className="w-96">
        <CardHeader><CardTitle>Account created</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Your account is pending administrator approval. You can log in once it
            has been activated.
          </p>
          <Button onClick={() => router.push("/login")}>Go to login</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-96">
      <CardHeader><CardTitle>Sign up — {role === "student" ? "Student" : "Instructor"}</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Button variant={role === "student" ? "default" : "outline"} onClick={() => setRoleState("student")}>Student</Button>
          <Button variant={role === "instructor" ? "default" : "outline"} onClick={() => setRoleState("instructor")}>Instructor</Button>
        </div>
        <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><Label>Password (min 8 chars)</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <div><Label>Invite code (required)</Label><Input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Paste the code you received" /></div>
        <div><Label>School (optional)</Label><Input value={school} onChange={(e) => setSchool(e.target.value)} /></div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={submit} disabled={loading || !inviteCode.trim()}>{loading ? "Creating account…" : "Sign up"}</Button>
      </CardContent>
    </Card>
  );
}

export default function SignupPage() {
  return (
    <main className="auth-backdrop flex min-h-screen items-center justify-center p-8">
      <Suspense><SignupForm /></Suspense>
    </main>
  );
}
