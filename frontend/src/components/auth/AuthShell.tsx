"use client";

import Link from "next/link";

/**
 * Sizing system: the panel uses container queries — 1cqw = 1% of panel
 * width ≈ panel/319, so every dimension below is written as the reference
 * mockup pixel value × (100/319) cqw and therefore scales with the panel
 * exactly as drawn in `design-reference/login page.png`.
 */

/** Approved PilotMate wordmark: bright-azure filled jet + navy name. */
export function PilotMateLogo({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center ${className}`}
      aria-label="PilotMate home"
    >
      <svg
        viewBox="0 0 32 22"
        className="h-[clamp(20px,6.9cqw,36px)] w-auto"
        aria-hidden="true"
      >
        <path
          fill="#4F99F6"
          d="M31.4 9.3c.5-.6.4-1.6-.3-2.1-.6-.5-1.5-.4-2 .2l-6.4 6.1-9.6-7.7-2.7.7 5.7 7.9-5.4 5.1-4.4-1.4-1.8 1.7 3.7 3.2 1 4.3 1.8-1.7.6-4.4 6.3-3.6 7.5 5.3 2.7-.7-2.4-8.3 6.6-4.3z"
        />
      </svg>
      <span className="ml-[2.2cqw] text-[clamp(15px,5.4cqw,27px)] font-bold tracking-tight text-[#07315A]">
        PilotMate
      </span>
    </Link>
  );
}

/**
 * Shared login/signup layout from the approved design: full-viewport
 * daylight cockpit photograph with the translucent glass panel at the
 * reference position — 33.4% wide, 4.1% from the right edge, vertically
 * centered. Collapses to a full-width card on small screens.
 */
export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="cockpit-backdrop relative flex min-h-screen items-stretch">
      <div className="flex w-full items-center justify-center px-4 py-10 sm:px-6 lg:justify-end lg:pr-[4.1vw]">
        <div className="w-full max-w-[600px] lg:w-[33.4vw] lg:min-w-[360px] [container-type:inline-size]">
          <div className="auth-glass rounded-[clamp(16px,1.6vw,26px)] px-[clamp(24px,9.4cqw,56px)] pt-[clamp(28px,10.3cqw,60px)] pb-[clamp(30px,11.3cqw,66px)]">
            <PilotMateLogo className="mb-[clamp(16px,7.6cqw,44px)]" />
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}

/** Navy heading with the product name in aviation blue, as in the design. */
export function AuthHeading({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-[clamp(20px,6.6cqw,36px)] leading-[1.15] font-bold tracking-tight text-[#07315A]">
      {children}
    </h1>
  );
}

/** Slate-blue tagline under the heading. */
export function AuthTagline({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-[clamp(6px,2.2cqw,13px)] mb-0 text-[clamp(12px,3.1cqw,16px)] leading-snug text-[#7C97B2]">
      {children}
    </p>
  );
}

/**
 * Compact two-option segmented selector (Student / Instructor) rendered
 * inside the single login panel above the fields. Aviation-blue selection
 * matching the reference's rounded blue elements.
 */
export function RoleSegment({
  value,
  onChange,
  options,
  label = "Account type",
}: {
  value: "student" | "instructor";
  onChange: (v: "student" | "instructor") => void;
  options?: readonly ("student" | "instructor")[];
  label?: string;
}) {
  const items = options ?? (["student", "instructor"] as const);
  return (
    <div
      role="tablist"
      aria-label={label}
      className="mt-[clamp(16px,6.4cqw,38px)] flex rounded-full border border-[#D7E6F2] bg-white/70 p-[0.9cqw]"
    >
      {items.map((r) => (
        <button
          key={r}
          type="button"
          role="tab"
          aria-selected={value === r}
          onClick={() => onChange(r)}
          className={`flex-1 rounded-full px-[3cqw] py-[1.7cqw] text-[clamp(13px,3.9cqw,19px)] font-semibold capitalize transition-colors focus-visible:ring-2 focus-visible:ring-[#2585CF]/40 focus-visible:outline-none ${
            value === r
              ? "bg-[#2585CF] text-white shadow-[0_3px_10px_rgba(37,133,207,0.3)]"
              : "text-[#52708F] hover:bg-[#EAF5FC]"
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

/**
 * Rounded auth input with a leading icon and optional trailing slot
 * (e.g. a password-visibility toggle).
 */
export function AuthField({
  icon,
  trailing,
  ...props
}: React.ComponentProps<"input"> & {
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="relative">
      {icon && (
        <span
          className="pointer-events-none absolute top-1/2 left-[4.6cqw] -translate-y-1/2 text-[#92ABC8]"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <input {...props} className={`auth-field w-full ${props.className ?? ""}`} />
      {trailing && (
        <span className="absolute top-1/2 right-[3.4cqw] -translate-y-1/2">{trailing}</span>
      )}
    </div>
  );
}

/** Envelope glyph for the email field. */
export function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[clamp(17px,5.6cqw,28px)] w-[clamp(17px,5.6cqw,28px)]" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

/** Padlock glyph for the password field. */
export function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[clamp(17px,5.6cqw,28px)] w-[clamp(17px,5.6cqw,28px)]" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

/** Eye / eye-off visibility toggle for password fields. */
export function PasswordVisibilityToggle({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? "Hide password" : "Show password"}
      className="rounded-full p-1 text-[#92ABC8] transition-colors hover:text-[#2585CF] focus-visible:ring-2 focus-visible:ring-[#2585CF]/40 focus-visible:outline-none"
    >
      {visible ? (
        <svg viewBox="0 0 24 24" className="h-[clamp(17px,5.6cqw,28px)] w-[clamp(17px,5.6cqw,28px)]" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
          <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
          <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
          <path d="m2 2 20 20" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-[clamp(17px,5.6cqw,28px)] w-[clamp(17px,5.6cqw,28px)]" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}

/** Aviation-blue pill "Sign in / Sign up" button with trailing arrow. */
export function AuthSubmitButton({
  loading,
  loadingLabel,
  children,
  arrow = false,
}: {
  loading: boolean;
  loadingLabel: string;
  children: React.ReactNode;
  arrow?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="mt-[2.1cqw] inline-flex h-[clamp(46px,10.7cqw,58px)] w-full items-center justify-center gap-[2cqw] rounded-full bg-[#2585CF] text-[clamp(14px,4.3cqw,22px)] font-semibold text-white shadow-[0_8px_20px_rgba(37,133,207,0.28)] transition-colors hover:bg-[#1D6FAF] focus-visible:ring-2 focus-visible:ring-[#2585CF]/50 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60"
    >
      {loading ? loadingLabel : children}
      {arrow && !loading && (
        <svg viewBox="0 0 24 24" className="h-[1.1em] w-[1.1em]" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      )}
    </button>
  );
}

/** "OR" hairline divider from the approved design. */
export function AuthDivider() {
  return (
    <div
      className="my-[clamp(16px,6.3cqw,38px)] flex items-center gap-[4cqw]"
      aria-hidden="true"
    >
      <span className="h-px flex-1 bg-[#D7E6F2]" />
      <span className="text-[clamp(11px,3.4cqw,17px)] font-medium tracking-[0.14em] text-[#ADC6DE] uppercase">
        or
      </span>
      <span className="h-px flex-1 bg-[#D7E6F2]" />
    </div>
  );
}
