import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dashboardCards, requiresStudentSession } from "./dashboard-cards.ts";

const titles = (role) => dashboardCards(role).map((c) => c.title);
const hrefs = (role) => dashboardCards(role).map((c) => c.href);

const KNOWN_ROUTES = ["/student", "/instructor", "/documentation", "/exams"];

describe("dashboardCards", () => {
  it("keeps the existing student set", () => {
    assert.deepEqual(titles("student"), ["Student", "Documentation", "Exams"]);
    assert.deepEqual(hrefs("student"), ["/student", "/documentation", "/exams"]);
  });

  it("keeps the existing instructor set", () => {
    assert.deepEqual(titles("instructor"), ["Instructor", "Exams", "Documentation"]);
    assert.deepEqual(hrefs("instructor"), ["/instructor", "/exams", "/documentation"]);
  });

  it("restores Student for admin alongside Instructor, Documentation and Exams", () => {
    const admin = titles("admin");
    for (const expected of ["Student", "Instructor", "Documentation", "Exams"]) {
      assert.ok(admin.includes(expected), `admin is missing ${expected}`);
    }
    assert.equal(admin.length, 4);
    assert.deepEqual(hrefs("admin")[0], "/student");
  });

  it("does not duplicate cards or invent routes", () => {
    for (const role of ["student", "instructor", "admin", null, "unexpected"]) {
      const cards = dashboardCards(role);
      const cardTitles = cards.map((c) => c.title);
      assert.equal(new Set(cardTitles).size, cardTitles.length, `duplicate card for role=${role}`);
      for (const card of cards) {
        assert.ok(KNOWN_ROUTES.includes(card.href), `unexpected route ${card.href} for role=${role}`);
        assert.ok(card.title && card.description && card.iconPath, `incomplete card ${card.title}`);
      }
    }
  });

  it("does not show Student to instructors", () => {
    assert.ok(!titles("instructor").includes("Student"));
  });

  it("falls back to the instructor set for an unknown or missing role", () => {
    assert.deepEqual(titles(null), ["Instructor", "Exams", "Documentation"]);
    assert.deepEqual(titles("other"), ["Instructor", "Exams", "Documentation"]);
  });
});

describe("requiresStudentSession", () => {
  it("blocks the Student card for an admin so they get a message instead of a redirect", () => {
    assert.equal(requiresStudentSession("/student", "admin"), true);
  });

  it("lets students open the Student area normally", () => {
    assert.equal(requiresStudentSession("/student", "student"), false);
  });

  it("denies by default when the role is unknown", () => {
    assert.equal(requiresStudentSession("/student", null), true);
    assert.equal(requiresStudentSession("/student", "instructor"), true);
    assert.equal(requiresStudentSession("/student", "other"), true);
  });

  it("never blocks the other module cards", () => {
    for (const href of ["/instructor", "/documentation", "/exams"]) {
      assert.equal(requiresStudentSession(href, "admin"), false, href);
    }
  });
});
