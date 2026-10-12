import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="auth-backdrop flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-4xl font-bold">PilotMate</h1>
      <p className="text-muted-foreground">Training assistant for student pilots and flight instructors.</p>
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="w-72">
          <CardHeader><CardTitle>Student</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Link className="underline" href="/login?role=student">Log in</Link>
            <Link className="underline" href="/signup?role=student">Sign up</Link>
          </CardContent>
        </Card>
        <Card className="w-72">
          <CardHeader><CardTitle>Instructor</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Link className="underline" href="/login?role=instructor">Log in</Link>
            <Link className="underline" href="/signup?role=instructor">Sign up</Link>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
