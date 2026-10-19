"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return iso;
  }
}

interface Plan {
  key: string;
  name: string;
  available: boolean;
  amount: number | null;
  currency: string | null;
  interval: string | null;
}

interface BillingConfig {
  trial_days: number;
  estimated_first_billing_date: string | null;
  plans: Plan[];
}

interface StatusInfo {
  has_access: boolean;
  subscription: { trial_end: string | null } | null;
}

export default function BillingSuccessPage() {
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [retries, setRetries] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function check() {
      try {
        const [cfg, st] = await Promise.all([
          apiFetch("/billing/config"),
          apiFetch("/billing/status", { method: "POST" }),
        ]);
        if (cancelled) return;
        setConfig(cfg as BillingConfig);
        setStatus(st as StatusInfo);
        if (!(st as StatusInfo).has_access && retries < 5) {
          timer = setTimeout(() => setRetries((r) => r + 1), 2500);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }
    check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [retries]);

  const sub = status?.subscription ?? null;
  const trialDays = config?.trial_days ?? null;
  const firstBilling =
    sub?.trial_end ||
    config?.estimated_first_billing_date ||
    null;
  const plan = config?.plans.find((p) => p.amount != null) || config?.plans[0];

  return (
    <main className="auth-backdrop flex min-h-screen items-center justify-center p-8">
      <Card className="w-96">
        <CardHeader>
          <CardTitle>Payment details saved</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Thank you — your payment method was collected securely by Stripe.
            {trialDays ? ` Your ${trialDays}-day free trial has started and you will not be charged today.` : ""}
          </p>
          <div className="rounded-lg border border-border p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Plan</span>
              <span className="font-medium">
                {plan ? plan.name : "—"}
                {plan && plan.amount != null
                  ? ` — ${(plan.amount / 100).toFixed(2)} ${plan.currency || ""}${plan.interval === "year" ? "/yr" : plan.interval === "month" ? "/mo" : ""}`
                  : ""}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-muted-foreground">First billing date</span>
              <span className="font-medium">{formatDate(firstBilling) || "after the trial ends"}</span>
            </div>
          </div>
          {status && !status.has_access && (
            <p className="text-sm text-muted-foreground">
              Activating your subscription… refresh in a moment if access is not yet enabled.
              The success page is not treated as proof of payment — access is granted only after
              Stripe&apos;s verified webhook confirms it.
            </p>
          )}
          {status?.has_access && (
            <p className="text-sm text-green-600 dark:text-green-400">Subscription active — all features unlocked.</p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Link href="/student"><Button className="w-full">Continue to PilotMate</Button></Link>
          <Link href="/login"><Button variant="outline" className="w-full">Go to login</Button></Link>
        </CardContent>
      </Card>
    </main>
  );
}
