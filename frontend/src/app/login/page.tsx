"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, setRole, setToken } from "@/lib/api";
import AuthShell, {
  AuthDivider,
  AuthField,
  AuthHeading,
  AuthSubmitButton,
  AuthTagline,
  LockIcon,
  MailIcon,
  PasswordVisibilityToggle,
  RoleSegment,
} from "@/components/auth/AuthShell";

type Role = "student" | "instructor" | "admin";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const paramRole = params.get("role");
  // Staff route: /login?role=admin selects the admin login endpoint and
  // hides the public two-option selector. Backend authorization remains
  // authoritative in every case — the parameter only chooses which login
  // endpoint receives the credentials.
  const staffMode = paramRole === "admin";
  const [role, setRoleState] = useState<"student" | "instructor">(
    paramRole === "instructor" ? "instructor" : "student",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const activeRole: Role = staffMode ? "admin" : role;
    try {
      const data = await apiFetch(`/auth/${activeRole}/login`, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(data.access_token);
      setRole(activeRole);
      router.push(activeRole === "admin" ? "/admin" : "/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <AuthHeading>
        Welcome to <span className="text-[#2585CF]">PilotMate</span>
      </AuthHeading>
      <AuthTagline>Train smarter. Prepare confidently. Fly professionally.</AuthTagline>

      {!staffMode && <RoleSegment value={role} onChange={setRoleState} />}

      <form onSubmit={submit} className="mt-[clamp(15px,5.6cqw,34px)] flex flex-col gap-[clamp(10px,3.1cqw,18px)]" noValidate>
        <AuthField
          icon={<MailIcon />}
          type="email"
          name="email"
          autoComplete="email"
          placeholder="Email address"
          aria-label="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <AuthField
          icon={<LockIcon />}
          type={showPassword ? "text" : "password"}
          name="password"
          autoComplete="current-password"
          placeholder="Password"
          aria-label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          trailing={
            <PasswordVisibilityToggle
              visible={showPassword}
              onToggle={() => setShowPassword((v) => !v)}
            />
          }
        />

        {error && (
          <p role="alert" className="text-[clamp(13px,3.9cqw,19px)] font-medium text-[#DC2626]">
            {error}
          </p>
        )}

        <AuthSubmitButton loading={loading} loadingLabel="Signing in…" arrow>
          Sign in
        </AuthSubmitButton>
      </form>

      <AuthDivider />

      <p className="text-center text-[clamp(12px,3.6cqw,18px)] text-[#A2B9CF]">
        New to PilotMate?{" "}
        <button
          type="button"
          onClick={() => router.push(`/signup?role=${role}`)}
          className="font-semibold text-[#2585CF] hover:underline focus-visible:ring-2 focus-visible:ring-[#2585CF]/40 focus-visible:outline-none"
        >
          Create an account
        </button>
      </p>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
