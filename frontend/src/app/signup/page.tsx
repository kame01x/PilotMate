"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Plan {
  key: string;
  name: string;
  available: boolean;
  amount: number | null;
  currency: string | null;
  interval: string | null;
}

function formatPrice(plan: Plan | undefined): string {
  if (!plan || plan.amount == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: plan.currency || "USD" })
    .format(plan.amount / 100) + (plan.interval === "year" ? " / year" : plan.interval === "month" ? " / month" : "");
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return "";
  }
}

interface BillingConfigInfo {
  configured: boolean;
  trial_days: number;
  estimated_first_billing_date: string | null;
  plans: Plan[];
}

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
  const [studentId, setStudentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [billingConfig, setBillingConfig] = useState<BillingConfigInfo | null>(null);
  const [trialLoading, setTrialLoading] = useState(false);
  const [trialError, setTrialError] = useState<string | null>(null);

  useEffect(() => {
    if (!done || role !== "student") return;
    apiFetch("/billing/config")
      .then((d) => setBillingConfig(d as BillingConfigInfo))
      .catch(() => setBillingConfig(null));
  }, [done, role]);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch(`/auth/${role}/signup`, {
        method: "POST",
        body: JSON.stringify({ name, email, password, school: school || null, invite_code: inviteCode.trim() }),
      });
      if (role === "student" && data?.student_id) setStudentId(data.student_id);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function startTrial(priceKey: string) {
    setTrialError(null);
    setTrialLoading(true);
    try {
      const data = await apiFetch("/billing/checkout-at-signup", {
        method: "POST",
        body: JSON.stringify({ student_id: studentId, invite_code: inviteCode.trim(), price_key: priceKey }),
      });
      if (data?.url) window.location.assign(data.url);
      else throw new Error("No checkout URL returned.");
    } catch (e) {
      setTrialError(e instanceof Error ? e.message : String(e));
      setTrialLoading(false);
    }
  }

  if (done) {
    const plans: Plan[] = billingConfig?.plans ?? [];
    const primary = plans.find((p) => p.key === "monthly" && p.available) || plans.find((p) => p.available);
    const trialDays = billingConfig?.trial_days ?? null;
    const firstBilling = billingConfig?.estimated_first_billing_date ?? null;
    const configured = billingConfig?.configured === true;

    if (role === "student" && billingConfig && configured) {
      return (
        <Card className="w-96">
          <CardHeader><CardTitle>Start your {trialDays}-day free trial</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Your account was created and is pending administrator approval.
              Add a payment method now — you will not be charged today.
            </p>
            <div className="rounded-lg border border-border bg-card p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Plan</span>
                <span className="font-medium">{formatPrice(primary)}{primary && primary.amount == null ? " (price set in Stripe)" : ""}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-muted-foreground">Free trial</span>
                <span className="font-medium">{trialDays} days</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-muted-foreground">First billing date</span>
                <span className="font-medium">{formatDate(firstBilling) || "—"}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Card details are collected by Stripe. You can cancel before the
                trial ends and no charge will be made.
              </p>
            </div>
            {trialError && <p className="text-sm text-destructive">{trialError}</p>}
            {primary?.available ? (
              <Button onClick={() => startTrial(primary.key)} disabled={trialLoading}>
                {trialLoading ? "Redirecting to Stripe…" : `Start free trial — ${formatPrice(primary)}`}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Subscriptions are not configured yet — you can subscribe later from the Billing page.
              </p>
            )}
            <Button variant="outline" onClick={() => router.push("/login")} disabled={trialLoading}>
              Not now — go to login
            </Button>
          </CardContent>
        </Card>
      );
    }

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
