"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Plan {
  key: string;
  name: string;
  available: boolean;
  amount: number | null;
  currency: string | null;
  interval: string | null;
}

interface BillingConfig {
  configured: boolean;
  publishable_key: string | null;
  test_mode: boolean | null;
  trial_days: number;
  estimated_first_billing_date: string | null;
  portal_configured: boolean;
  plans: Plan[];
  setup_message: string | null;
}

interface SubscriptionInfo {
  status: string;
  trial_end: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  ended_during_trial: boolean;
}

interface StatusInfo {
  has_access: boolean;
  is_beta_tester: boolean;
  access_reason: string | null;
  blocked_reason: string | null;
  subscription: SubscriptionInfo | null;
}

function formatPrice(plan: Plan): string {
  if (plan.amount == null) return plan.available ? "Price set in Stripe" : "Not configured";
  const value = new Intl.NumberFormat("en-US", { style: "currency", currency: plan.currency || "USD" })
    .format(plan.amount / 100);
  return plan.interval === "year" ? `${value} / year` : plan.interval === "month" ? `${value} / month` : value;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return iso;
  }
}

export default function Billing() {
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [cfg, st] = await Promise.all([
        apiFetch("/billing/config"),
        apiFetch("/billing/status", { method: "POST" }),
      ]);
      setConfig(cfg as BillingConfig);
      setStatus(st as StatusInfo);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Mount-only data fetch; setState happens after `await`, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function subscribe(priceKey: string) {
    setActionLoading("subscribe");
    setNotice(null);
    setError(null);
    try {
      const data = await apiFetch("/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ price_key: priceKey }),
      });
      if (data?.url) window.location.assign(data.url);
      else throw new Error("No checkout URL returned.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setActionLoading(null);
    }
  }

  async function openPortal() {
    setActionLoading("portal");
    setNotice(null);
    setError(null);
    try {
      const data = await apiFetch("/billing/portal", { method: "POST" });
      if (data?.url) window.location.assign(data.url);
      else throw new Error("No portal URL returned.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setActionLoading(null);
    }
  }

  async function cancelSub() {
    const duringTrial = status?.subscription?.status === "trialing";
    const ok = window.confirm(
      duringTrial
        ? "Cancel your free trial now? No subscription charge will be made."
        : "Cancel your subscription? It will end at the end of the current billing period."
    );
    if (!ok) return;
    setActionLoading("cancel");
    setNotice(null);
    setError(null);
    try {
      const data = await apiFetch("/billing/cancel", { method: "POST" });
      setNotice(data?.message || "Cancellation processed.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>Billing</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Loading billing status…</p></CardContent>
      </Card>
    );
  }

  const plans: Plan[] = config?.plans ?? [];
  const sub = status?.subscription ?? null;
  const trialDays = config?.trial_days ?? null;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Subscription status</CardTitle>
          <Button variant="outline" size="sm" onClick={() => { setLoading(true); load(); }}>Refresh</Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {notice && <p className="text-sm text-green-600 dark:text-green-400">{notice}</p>}

          {status?.is_beta_tester ? (
            <div className="flex items-center gap-2">
              <Badge>Free beta access</Badge>
              <span className="text-sm text-muted-foreground">
                Granted by an administrator — no payment details required, does not expire.
              </span>
            </div>
          ) : status?.has_access && status.access_reason === "trial" ? (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Free trial</Badge>
              <span className="text-sm text-muted-foreground">
                {sub?.trial_end ? `Trial ends ${formatDate(sub.trial_end)}. First billing date: ${formatDate(sub.trial_end)}.` :
                  `Your ${trialDays ?? ""}-day trial is active.`}
              </span>
            </div>
          ) : status?.has_access ? (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Active subscription</Badge>
              <span className="text-sm text-muted-foreground">
                {sub?.current_period_end ? `Renews ${formatDate(sub.current_period_end)}.` : ""}
                {sub?.cancel_at_period_end ? " Will cancel at period end." : ""}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Badge variant="outline">No subscription</Badge>
              <span className="text-sm text-muted-foreground">
                {status?.blocked_reason || "A subscription is required for AI training features."}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Plans</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!config?.configured && (
            <p className="text-sm text-muted-foreground">{config?.setup_message || "Billing is not configured yet."}</p>
          )}
          {config?.configured && !config.test_mode && (
            <p className="text-sm text-destructive">Warning: backend is not using a Stripe test-mode key.</p>
          )}
          {plans.map((plan) => (
            <div key={plan.key} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{plan.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatPrice(plan)}
                  {config?.configured && trialDays ? ` · free for ${trialDays} days, first charge ${formatDate(config?.estimated_first_billing_date)}` : ""}
                </p>
              </div>
              {plan.available && !status?.is_beta_tester && (
                <Button
                  size="sm"
                  onClick={() => subscribe(plan.key)}
                  disabled={actionLoading !== null || (status?.has_access ?? false)}
                >
                  {actionLoading === "subscribe" ? "Redirecting…" : status?.has_access ? "Subscribed" : `Start free trial`}
                </Button>
              )}
            </div>
          ))}
          {status?.is_beta_tester && (
            <p className="text-sm text-muted-foreground">
              Beta accounts do not need a subscription — checkout is disabled.
            </p>
          )}
        </CardContent>
      </Card>

      {sub && !status?.is_beta_tester && (
        <Card>
          <CardHeader><CardTitle>Manage billing</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={openPortal} disabled={actionLoading !== null || !config?.configured}>
              {actionLoading === "portal" ? "Opening…" : "Payment methods & invoices"}
            </Button>
            {!sub.cancel_at_period_end && sub.status !== "canceled" && (
              <Button variant="destructive" onClick={cancelSub} disabled={actionLoading !== null}>
                {actionLoading === "cancel" ? "Canceling…" : sub.status === "trialing" ? "Cancel trial (no charge)" : "Cancel subscription"}
              </Button>
            )}
            {sub.cancel_at_period_end && (
              <span className="text-sm text-muted-foreground self-center">
                Cancels at period end — {formatDate(sub.current_period_end)}.
              </span>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
