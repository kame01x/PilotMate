// Module card definitions for the dashboard, split by role.
// Kept as a pure module (no React/Next imports) so the role→cards mapping can
// be unit tested without a DOM.

export interface ModuleCardProps {
  title: string;
  description: string;
  iconPath: string;
  href: string;
}

const STUDENT: ModuleCardProps = {
  title: "Student",
  description: "Manage your flight training and learning activities.",
  iconPath: "M22 10v6M2 10l10-5 10 5-10 5z M6 12v5c0 1.6 2.7 3 6 3s6-1.4 6-3v-5",
  href: "/student",
};

const DOCUMENTATION: ModuleCardProps = {
  title: "Documentation",
  description: "Access aviation documents and reference materials.",
  iconPath: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z",
  href: "/documentation",
};

const EXAMS: ModuleCardProps = {
  title: "Exams",
  description: "Prepare for aviation examinations and review your knowledge.",
  iconPath: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
  href: "/exams",
};

const INSTRUCTOR: ModuleCardProps = {
  title: "Instructor",
  description: "Access your instructor workspace and training tools.",
  iconPath: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  href: "/instructor",
};

const STUDENT_CARDS: ModuleCardProps[] = [STUDENT, DOCUMENTATION, EXAMS];
const INSTRUCTOR_CARDS: ModuleCardProps[] = [INSTRUCTOR, EXAMS, DOCUMENTATION];
// Admin sees every module: the existing Instructor/Exams/Documentation entry
// points with Student restored alongside them.
const ADMIN_CARDS: ModuleCardProps[] = [STUDENT, INSTRUCTOR, EXAMS, DOCUMENTATION];

export function dashboardCards(role: string | null): ModuleCardProps[] {
  if (role === "student") return STUDENT_CARDS;
  if (role === "admin") return ADMIN_CARDS;
  return INSTRUCTOR_CARDS;
}

// The Student card opens the student learning workspace, which only a
// student session may enter (the /student route guard and every backend
// /student/* endpoint enforce this). Non-students — e.g. an admin who is
// shown the Student card — must be told this instead of being sent to a
// bare login form by the route guard. Deny-by-default for an unknown role.
export function requiresStudentSession(href: string, role: string | null): boolean {
  if (href !== "/student") return false;
  return role !== "student";
}
