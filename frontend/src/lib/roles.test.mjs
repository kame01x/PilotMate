import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveAppRole, canUseLearningLibrary } from "./roles.ts";

describe("resolveAppRole", () => {
  it("keeps the three signed-in roles", () => {
    assert.equal(resolveAppRole("student"), "student");
    assert.equal(resolveAppRole("instructor"), "instructor");
    assert.equal(resolveAppRole("admin"), "admin");
  });

  it("resolves anything else to guest", () => {
    assert.equal(resolveAppRole(null), "guest");
    assert.equal(resolveAppRole(undefined), "guest");
    assert.equal(resolveAppRole(""), "guest");
    assert.equal(resolveAppRole("Student"), "guest");
    assert.equal(resolveAppRole("root"), "guest");
  });
});

describe("canUseLearningLibrary", () => {
  it("allows student and instructor sessions", () => {
    assert.equal(canUseLearningLibrary("student"), true);
    assert.equal(canUseLearningLibrary("instructor"), true);
  });

  it("denies admin, guests and unknown roles", () => {
    assert.equal(canUseLearningLibrary("admin"), false);
    assert.equal(canUseLearningLibrary(null), false);
    assert.equal(canUseLearningLibrary(undefined), false);
    assert.equal(canUseLearningLibrary("root"), false);
  });
});
