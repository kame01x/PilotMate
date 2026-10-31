"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
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

type Role = "student" | "instructor";

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[clamp(17px,5.6cqw,28px)] w-[clamp(17px,5.6cqw,28px)]" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function SchoolIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[clamp(17px,5.6cqw,28px)] w-[clamp(17px,5.6cqw,28px)]" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 9 9-5 9 5-9 5-9-5Z" />
      <path d="M7 11.5V17c2.4 1.4 7.6 1.4 10 0v-5.5" />
      <path d="M21 9v6" />
    </svg>
  );
}

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const initialRole = params.get("role") === "instructor" ? "instructor" : "student";
  const [role, setRoleState] = useState<Role>(initialRole);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [school, setSchool] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch(`/auth/${role}/signup`, {
        method: "POST",
        body: JSON.stringify({ name, email, password, school: school || null }),
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }
  return (
    <AuthShell
      backdropClassName="sign-up-backdrop"
      containerClassName="items-center justify-center px-4 py-6 sm:px-6 lg:justify-start lg:pl-[4.1vw] lg:pr-6"
    >
      {done ? (
        <div className="flex flex-col">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7C97B2]">
            Registration complete
          </p>
          <h1 className="mt-2 text-[clamp(24px,7cqw,34px)] font-bold leading-tight tracking-tight text-[#07315A]">
            Account created
          </h1>
          <p className="mt-3 text-[13px] leading-relaxed text-[#6E8BA8]">
            Your {role} account is ready. Sign in with your email and password to continue.
          </p>
          <button
            type="button"
            onClick={() => router.push(`/login?role=${role}`)}
            className="mt-7 inline-flex h-[clamp(46px,10.7cqw,54px)] w-full items-center justify-center gap-2 rounded-full bg-[#2585CF] text-[clamp(14px,4.3cqw,20px)] font-semibold text-white shadow-[0_8px_20px_rgba(37,133,207,0.28)] transition-colors hover:bg-[#1D6FAF] focus-visible:ring-2 focus-visible:ring-[#2585CF]/50 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Go to login
          </button>
        </div>
      ) : (
        <>
          <AuthHeading>
            Create <span className="text-[#2585CF]">Account</span>
          </AuthHeading>
          <AuthTagline>Access your navigation suite.</AuthTagline>

          <RoleSegment value={role} onChange={setRoleState} />

          <form
            onSubmit={submit}
            className="mt-[clamp(15px,5.6cqw,34px)] flex flex-col gap-[clamp(10px,3.1cqw,18px)]"
          >
            <AuthField
              icon={<UserIcon />}
              type="text"
              name="name"
              autoComplete="name"
              placeholder="Full name"
              aria-label="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

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
              autoComplete="new-password"
              placeholder="Password (min 8 characters)"
              aria-label="Password (minimum 8 characters)"
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

            <AuthField
              icon={<SchoolIcon />}
              type="text"
              name="school"
              autoComplete="organization"
              placeholder="School (optional)"
              aria-label="School (optional)"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
            />

            {error && (
              <p role="alert" className="text-[clamp(13px,3.9cqw,19px)] font-medium text-[#DC2626]">
                {error}
              </p>
            )}

            <AuthSubmitButton loading={loading} loadingLabel="Creating account•" arrow>
              Sign up
            </AuthSubmitButton>
          </form>

          <AuthDivider />

          <p className="text-center text-[clamp(12px,3.6cqw,16px)] text-[#A2B9CF]">
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => router.push(`/login?role=${role}`)}
              className="font-semibold text-[#2585CF] hover:underline focus-visible:ring-2 focus-visible:ring-[#2585CF]/40 focus-visible:outline-none"
            >
              Log in
            </button>
          </p>
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="text-[clamp(11px,3.2cqw,14px)] font-medium text-[#8AA4BE] transition-colors hover:text-[#07315A] focus-visible:ring-2 focus-visible:ring-[#2585CF]/40 focus-visible:outline-none"
            >
              Main menu
            </button>
          </div>
        </>
      )}
    </AuthShell>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <AuthShell
          backdropClassName="sign-up-backdrop"
          containerClassName="items-center justify-center px-4 py-6 sm:px-6 lg:justify-start lg:pl-[4.1vw] lg:pr-6"
        >
          <AuthTagline>Loading sign up•</AuthTagline>
        </AuthShell>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
