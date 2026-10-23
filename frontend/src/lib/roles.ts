// Role helpers shared by the pages that need to know what a stored session is
// allowed to open. Kept as a pure module (no React/Next/browser imports) so it
// can be unit tested without a DOM, like dashboard-cards.ts.

export type AppRole = "guest" | "student" | "instructor" | "admin";

// Maps a stored role string (from localStorage) onto a known app role.
// Anything missing or unrecognized resolves to "guest" — never to a signed-in
// role — so callers can safely branch on the result.
export function resolveAppRole(role: string | null | undefined): AppRole {
  if (role === "student" || role === "instructor" || role === "admin") return role;
  return "guest";
}

// The Documentation (Library) and Exams (/exam-prep/*) areas are served by
// backend endpoints that authenticate with get_current_user, which only
// accepts student or instructor tokens (see backend/api/deps.py). An admin or
// unknown session must not reach those screens — the API would answer 403.
// Deny-by-default: only the two known learning roles pass.
export function canUseLearningLibrary(role: string | null | undefined): boolean {
  const appRole = resolveAppRole(role);
  return appRole === "student" || appRole === "instructor";
}
