import Link from "next/link";
import { GraduationCap, Users, ShieldCheck } from "lucide-react";
import { PilotMateLogo } from "@/components/auth/AuthShell";

export default function Home() {
  return (
    <main className="pm-landing" aria-label="PilotMate landing">
      <section className="pm-hero">
        <div className="pm-hero-inner">
          <header className="pm-header">
            <PilotMateLogo className="pm-logo" />
            <Link className="pm-signin" href="/login">Sign In</Link>
          </header>
          <div className="pm-hero-copy">
            <p className="pm-eyebrow">
  <span className="pm-eyebrow-word" style={{ color: '#4F99F6' }}>Train</span>
  <span className="pm-eyebrow-separator" style={{ color: '#000', margin: '0 4px' }}>{'\u00B7'}</span>
  <span className="pm-eyebrow-word" style={{ color: '#4F99F6' }}>Practice</span>
  <span className="pm-eyebrow-separator" style={{ color: '#000', margin: '0 4px' }}>{'\u00B7'}</span>
  <span className="pm-eyebrow-word" style={{ color: '#4F99F6' }}>Fly</span>
</p>
            <h1 className="pm-title">Your Aviation Journey<br /><span style={{ color: '#4F99F6' }}>Starts Here</span></h1>
            <p className="pm-hero-lede" style={{ color: '#2a4b68', marginTop: '16px' }}>
  PilotMate provides the tools, resources and training support you need to build your aviation career.
</p>
          </div>
        </div>
      </section>

      <div className="pm-cards">
        <Link className="pm-card" href="/login?role=student">
          <div className="pm-card-inner">
            <div className="pm-card-head">
              <span className="pm-card-icon">
                <GraduationCap />
              </span>
              <h2>Student</h2>
            </div>
            <p>Access your training, track progress and build your flight hours.</p>
            <span className="pm-card-cta">
              Continue as Student
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </span>
          </div>
        </Link>

        <Link className="pm-card" href="/login?role=instructor">
          <div className="pm-card-inner">
            <div className="pm-card-head">
              <span className="pm-card-icon">
                <Users />
              </span>
              <h2>Instructor</h2>
            </div>
            <p>Manage your students, create training plans and track performance.</p>
            <span className="pm-card-cta">
              Continue as Instructor
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </span>
          </div>
        </Link>

        <Link className="pm-card pm-card--staff" href="/login?role=admin">
          <div className="pm-card-inner">
            <div className="pm-card-head">
              <span className="pm-card-icon">
                <ShieldCheck />
              </span>
              <h2>Staff Access</h2>
            </div>
            <p>Administrative access for PilotMate staff and administrators.</p>
            <span className="pm-card-cta">
              Staff Login
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </span>
          </div>
        </Link>
      </div>

      <footer className="pm-footer">
        <p className="pm-copyright">Â© 2026 PilotMate. All rights reserved.</p>
      </footer>
    </main>
  );
}
