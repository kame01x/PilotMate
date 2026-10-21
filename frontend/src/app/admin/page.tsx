"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, isAdminSession, setRole, setToken } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ThemeToggle from "@/components/ThemeToggle";

interface StudentRow {
  id: number;
  business_id: string;
  name: string;
  email: string | null;
  account_status: string;
  created_at: string;
  is_beta_tester: boolean;
  subscription_status: string | null;
  subscription_valid: boolean;
  has_access: boolean;
}

interface InstructorRow {
  id: number;
  business_id: string;
  name: string;
  email: string | null;
  account_status: string;
  created_at: string;
}

interface Stats {
  total_users: number;
  total_students: number;
  total_instructors: number;
  student_account_status: Record<string, number>;
  active_subscribers: number;
  free_beta_testers: number;
  subscription_status: Record<string, number>;
  pending_invites: number;
}

interface SubRow {
  id: number;
  student: { business_id: string; name: string; email: string | null; is_beta_tester: boolean } | null;
  status: string;
  price_id: string | null;
  trial_end: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  ended_during_trial: boolean;
}

interface Health {
  backend: { status: string; environment: string };
  database: { connected: boolean };
  ai_providers: Record<string, boolean>;
  stripe: { configured: boolean; webhook_configured: boolean; prices_configured: boolean; test_mode: boolean; trial_days: number };
  recent_errors: { available: boolean; entries: string[] };
}

interface InviteRow {
  id: number;
  email: string;
  role: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
}

function statusBadge(status: string) {
  const variant =
    status === "active" ? "default" :
    status === "pending" ? "secondary" :
    status === "expired" ? "outline" : "destructive";
  return <Badge variant={variant}>{status}</Badge>;
}

function subBadge(row: StudentRow) {
  if (row.is_beta_tester) return <Badge variant="secondary">beta tester</Badge>;
  if (!row.subscription_status) return <Badge variant="outline">no subscription</Badge>;
  const good = row.subscription_valid;
  return <Badge variant={good ? "default" : "destructive"}>{row.subscription_status}</Badge>;
}

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState("overview");

  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<{ students: StudentRow[]; instructors: InstructorRow[] } | null>(null);
  const [subs, setSubs] = useState<SubRow[] | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [invites, setInvites] = useState<InviteRow[] | null>(null);

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"student" | "instructor">("student");
  const [lastInvite, setLastInvite] = useState<string | null>(null);

  useEffect(() => {
    const ok = isAdminSession();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAuthorized(ok);
    if (!ok) router.push("/login?role=admin");
  }, [router]);

  const loadAll = useCallback(async () => {
    try {
      const [s, u, sub, h, inv] = await Promise.all([
        apiFetch("/admin/stats"),
        apiFetch("/admin/users"),
        apiFetch("/admin/subscriptions"),
        apiFetch("/admin/system-health"),
        apiFetch("/admin/invites"),
      ]);
      setStats(s);
      setUsers(u);
      setSubs(sub);
      setHealth(h);
      setInvites(inv);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Runs after the access check flips `authorized`; mount-only otherwise.
    // All setState calls happen after `await` (async), so there is no
    // synchronous cascading render.
    if (!authorized) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
  }, [authorized, loadAll]);

  function logout() {
    setToken(null);
    setRole(null);
    router.push("/");
  }

  async function action(key: string, fn: () => Promise<string>) {
    setBusy(key);
    setNotice(null);
    try {
      const msg = await fn();
      setNotice(msg);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const toggleBeta = (row: StudentRow) =>
    action(`beta-${row.id}`, async () => {
      const next = row.is_beta_tester ? "revoke" : "grant";
      await apiFetch("/admin/beta", {
        method: "POST",
        body: JSON.stringify({ user_id: row.id, user_type: "student", action: next }),
      });
      return next === "grant" ? `Beta access granted to ${row.name}.` : `Beta access revoked from ${row.name}.`;
    });

  const approve = (row: StudentRow) =>
    action(`approve-${row.id}`, async () => {
      await apiFetch("/admin/approve", {
        method: "POST",
        body: JSON.stringify({ user_id: row.id, user_type: "student" }),
      });
      return `${row.name} approved.`;
    });

  const setStatus = (row: StudentRow | InstructorRow, type: "student" | "instructor", status: string) =>
    action(`status-${type}-${row.id}`, async () => {
      await apiFetch("/admin/status", {
        method: "POST",
        body: JSON.stringify({ user_id: row.id, user_type: type, status }),
      });
      return `${row.name} set to ${status}.`;
    });

  const createInvite = async () => {
    setBusy("invite");
    setError(null);
    setNotice(null);
    try {
      const data = await apiFetch("/admin/invites", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, role: inviteRole, expires_in_days: 7 }),
      });
      setLastInvite(data.invite_code);
      setNotice(`Invite created for ${data.email}.`);
      setInviteEmail("");
      setInvites(await apiFetch("/admin/invites"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const revokeInvite = (inviteId: number) =>
    action(`revoke-${inviteId}`, async () => {
      await apiFetch("/admin/invites/revoke", { method: "POST", body: JSON.stringify({ invite_id: inviteId }) });
      return "Invite revoked.";
    });

  const q = search.trim().toLowerCase();
  const match = (name: string, email: string | null, bid: string) =>
    !q || name.toLowerCase().includes(q) || (email || "").toLowerCase().includes(q) || bid.toLowerCase().includes(q);
  const students = (users?.students ?? []).filter((s) => match(s.name, s.email, s.business_id));
  const instructors = (users?.instructors ?? []).filter((i) => match(i.name, i.email, i.business_id));

  // Render a neutral placeholder until the access check resolves, so the
  // admin header and contents never flash for non-admin visitors.
  if (!authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Checking access…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold sm:text-2xl">PilotMate Admin</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push("/dashboard")}>Dashboard</Button>
          <Button variant="ghost" size="sm" onClick={logout}>Log out</Button>
          <ThemeToggle />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-green-600 dark:text-green-400">{notice}</p>}

      {loading ? (
        <Card><CardContent className="p-6"><p className="text-sm text-muted-foreground">Loading admin data…</p></CardContent></Card>
      ) : !stats && !users ? (
        <Card><CardContent className="p-6">
          <p className="text-sm text-destructive">{error || "Failed to load admin data."}</p>
          <Button className="mt-3" onClick={() => { setLoading(true); loadAll(); }}>Retry</Button>
        </CardContent></Card>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
            <TabsTrigger value="health">System health</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { label: "Total users", value: stats?.total_users },
                { label: "Students", value: stats?.total_students },
                { label: "Instructors", value: stats?.total_instructors },
                { label: "Active subscribers", value: stats?.active_subscribers },
                { label: "Free beta testers", value: stats?.free_beta_testers },
                { label: "Pending invites", value: stats?.pending_invites },
              ].map((card) => (
                <Card key={card.label}>
                  <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle></CardHeader>
                  <CardContent><span className="text-2xl font-bold">{card.value ?? "—"}</span></CardContent>
                </Card>
              ))}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-base">Account status</CardTitle></CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {Object.entries(stats?.student_account_status ?? {}).map(([k, v]) => (
                    <Badge key={k} variant="outline">{k}: {String(v)}</Badge>
                  ))}
                  {Object.keys(stats?.student_account_status ?? {}).length === 0 && (
                    <p className="text-sm text-muted-foreground">No students yet.</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Subscription status</CardTitle></CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {Object.entries(stats?.subscription_status ?? {}).map(([k, v]) => (
                    <Badge key={k} variant="outline">{k}: {String(v)}</Badge>
                  ))}
                  {Object.keys(stats?.subscription_status ?? {}).length === 0 && (
                    <p className="text-sm text-muted-foreground">No subscriptions yet.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="users">
            <div className="mb-3 flex flex-col gap-3">
              <div>
                <Label htmlFor="admin-user-search">Search users</Label>
                <Input id="admin-user-search" value={search} onChange={(e) => setSearch(e.target.value)}
                       placeholder="Name, email or ID…" className="mt-1 max-w-md" />
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-48">
                  <Label htmlFor="invite-email">Create invite</Label>
                  <Input id="invite-email" type="email" value={inviteEmail}
                         onChange={(e) => setInviteEmail(e.target.value)} placeholder="email@example.com" className="mt-1" />
                </div>
                <select
                  aria-label="Invite role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "student" | "instructor")}
                  className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                >
                  <option value="student">student</option>
                  <option value="instructor">instructor</option>
                </select>
                <Button size="sm" onClick={createInvite} disabled={busy !== null || !inviteEmail.includes("@")}>
                  {busy === "invite" ? "Creating…" : "Create invite"}
                </Button>
              </div>
              {lastInvite && (
                <p className="break-all rounded-lg border border-border p-2 text-xs">
                  Last invite code: <code className="font-mono">{lastInvite}</code> — send it securely, valid 7 days.
                </p>
              )}
            </div>

            <Card className="mb-3">
              <CardHeader><CardTitle className="text-base">Students ({students.length})</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto p-0 sm:p-6">
                {students.length === 0 ? (
                  <p className="px-6 pb-4 text-sm text-muted-foreground">No students match.</p>
                ) : (
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">ID</th>
                        <th className="p-2">Account</th><th className="p-2">Access</th><th className="p-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s) => (
                        <tr key={s.id} className="border-b last:border-0">
                          <td className="p-2 font-medium">{s.name}</td>
                          <td className="p-2">{s.email}</td>
                          <td className="p-2 font-mono text-xs">{s.business_id}</td>
                          <td className="p-2">{statusBadge(s.account_status)}</td>
                          <td className="p-2">{subBadge(s)}</td>
                          <td className="p-2">
                            <div className="flex flex-wrap gap-1">
                              {s.account_status === "pending" && (
                                <Button size="xs" variant="outline" disabled={busy !== null}
                                        onClick={() => approve(s)}>Approve</Button>
                              )}
                              <Button size="xs" variant={s.is_beta_tester ? "destructive" : "secondary"}
                                      disabled={busy !== null} onClick={() => toggleBeta(s)}>
                                {busy === `beta-${s.id}` ? "…" : s.is_beta_tester ? "Revoke beta" : "Grant beta"}
                              </Button>
                              <select
                                aria-label={`Status for ${s.name}`}
                                value={s.account_status}
                                disabled={busy !== null}
                                onChange={(e) => setStatus(s, "student", e.target.value)}
                                className="h-6 rounded-md border border-input bg-transparent px-1 text-xs"
                              >
                                {["pending", "active", "suspended", "revoked", "expired"].map((st) => (
                                  <option key={st} value={st}>{st}</option>
                                ))}
                              </select>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Instructors ({instructors.length})</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto p-0 sm:p-6">
                {instructors.length === 0 ? (
                  <p className="px-6 pb-4 text-sm text-muted-foreground">No instructors match.</p>
                ) : (
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">ID</th>
                        <th className="p-2">Account</th><th className="p-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {instructors.map((i) => (
                        <tr key={i.id} className="border-b last:border-0">
                          <td className="p-2 font-medium">{i.name}</td>
                          <td className="p-2">{i.email}</td>
                          <td className="p-2 font-mono text-xs">{i.business_id}</td>
                          <td className="p-2">{statusBadge(i.account_status)}</td>
                          <td className="p-2">
                            <select
                              aria-label={`Status for ${i.name}`}
                              value={i.account_status}
                              disabled={busy !== null}
                              onChange={(e) => setStatus(i, "instructor", e.target.value)}
                              className="h-6 rounded-md border border-input bg-transparent px-1 text-xs"
                            >
                              {["pending", "active", "suspended", "revoked", "expired"].map((st) => (
                                <option key={st} value={st}>{st}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            {invites && invites.length > 0 && (
              <Card className="mt-3">
                <CardHeader><CardTitle className="text-base">Invites</CardTitle></CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {invites.map((inv) => (
                    <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2 text-sm">
                      <span>{inv.email} <span className="text-muted-foreground">({inv.role})</span></span>
                      <span className="flex items-center gap-2">
                        {inv.used_at ? <Badge variant="outline">used</Badge>
                          : inv.revoked_at ? <Badge variant="destructive">revoked</Badge>
                          : new Date(inv.expires_at) < new Date() ? <Badge variant="secondary">expired</Badge>
                          : <Badge>pending</Badge>}
                        {!inv.used_at && !inv.revoked_at && (
                          <Button size="xs" variant="destructive" disabled={busy !== null}
                                  onClick={() => revokeInvite(inv.id)}>Revoke</Button>
                        )}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="subscriptions">
            <Card>
              <CardHeader><CardTitle className="text-base">Subscription records ({subs?.length ?? 0})</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto p-0 sm:p-6">
                {!subs || subs.length === 0 ? (
                  <p className="px-6 pb-4 text-sm text-muted-foreground">
                    No subscriptions yet — records appear after Stripe test-mode checkout completes.
                  </p>
                ) : (
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="p-2">Student</th><th className="p-2">Status</th><th className="p-2">Price</th>
                        <th className="p-2">Trial ends</th><th className="p-2">Period end</th><th className="p-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subs.map((s) => (
                        <tr key={s.id} className="border-b last:border-0">
                          <td className="p-2">
                            <span className="font-medium">{s.student?.name ?? "unknown"}</span>
                            <span className="block text-xs text-muted-foreground">{s.student?.email}</span>
                          </td>
                          <td className="p-2"><Badge variant={["active", "trialing"].includes(s.status) ? "default" : "destructive"}>{s.status}</Badge></td>
                          <td className="p-2 font-mono text-xs">{s.price_id ?? "—"}</td>
                          <td className="p-2">{s.trial_end ? new Date(s.trial_end).toLocaleDateString() : "—"}</td>
                          <td className="p-2">{s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : "—"}</td>
                          <td className="p-2 text-xs text-muted-foreground">
                            {s.cancel_at_period_end ? "cancels at period end; " : ""}
                            {s.ended_during_trial ? "ended during trial (no charge)" : ""}
                            {!s.cancel_at_period_end && !s.ended_during_trial ? "—" : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="health">
            <div className="grid gap-3 sm:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-base">Backend & database</CardTitle></CardHeader>
                <CardContent className="flex flex-col gap-2 text-sm">
                  <span>Status: <Badge variant={health?.backend?.status === "ok" ? "default" : "destructive"}>{health?.backend?.status ?? "unknown"}</Badge></span>
                  <span>Environment: <Badge variant="outline">{health?.backend?.environment ?? "—"}</Badge></span>
                  <span>Database: <Badge variant={health?.database?.connected ? "default" : "destructive"}>{health?.database?.connected ? "connected" : "unavailable"}</Badge></span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">AI providers (configured)</CardTitle></CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {Object.entries(health?.ai_providers ?? {}).map(([k, v]) => (
                    <Badge key={k} variant={v ? "default" : "outline"}>{k}: {v ? "on" : "off"}</Badge>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Stripe (test mode)</CardTitle></CardHeader>
                <CardContent className="flex flex-wrap gap-2 text-sm">
                  <Badge variant={health?.stripe?.configured ? "default" : "outline"}>
                    {health?.stripe?.configured ? "configured" : "not configured"}
                  </Badge>
                  <Badge variant={health?.stripe?.webhook_configured ? "default" : "outline"}>
                    webhook {health?.stripe?.webhook_configured ? "configured" : "missing"}
                  </Badge>
                  <Badge variant={health?.stripe?.prices_configured ? "default" : "outline"}>
                    prices {health?.stripe?.prices_configured ? "configured" : "missing"}
                  </Badge>
                  <Badge variant={health?.stripe?.test_mode ? "default" : health?.stripe?.configured ? "destructive" : "outline"}>
                    {health?.stripe?.test_mode ? "test mode" : health?.stripe?.configured ? "NOT test mode" : "no key"}
                  </Badge>
                  <Badge variant="outline">trial: {health?.stripe?.trial_days} days</Badge>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Recent errors</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {health?.recent_errors?.available
                      ? "Available entries listed here."
                      : "Error log not available yet — errors are written to backend logs on Render."}
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
