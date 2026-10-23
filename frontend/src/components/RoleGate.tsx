"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Shown when a signed-in session opens a learning area that its role cannot
// use (e.g. an admin opening Documentation or Exams). Explains the situation
// and offers the correct destinations instead of letting the page call
// /library/* or /exam-prep/* with a token the backend will reject. Navigating
// away never touches the stored session — only a successful new login does.
export default function RoleGate({ feature, role }: { feature: string; role: string }) {
  const router = useRouter();
  return (
    <main className="auth-backdrop flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{feature} requires a student or instructor account</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {feature} is part of the learning workspace. You&apos;re signed in as {role},
            so it is not available for this session. Signing in with a student or
            instructor account will replace the current session on this device only
            after the new credentials are submitted.
          </p>
          <div className="flex flex-col gap-2">
            <Button onClick={() => router.push(role === "admin" ? "/admin" : "/dashboard")}>
              Back to {role === "admin" ? "admin dashboard" : "dashboard"}
            </Button>
            <Button variant="outline" onClick={() => router.push("/login?role=student")}>
              Sign in as student
            </Button>
            <Button variant="outline" onClick={() => router.push("/login?role=instructor")}>
              Sign in as instructor
            </Button>
            <Button variant="ghost" onClick={() => router.push("/")}>
              Main menu
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
