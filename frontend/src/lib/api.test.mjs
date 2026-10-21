import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { apiFetch, getToken, isAdminSession, setRole, setToken, studentRouteAccess } from "./api.ts";

const INITIAL_HREF = "/initial-sentinel";

let store;

beforeEach(() => {
  store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  globalThis.window = { location: { href: INITIAL_HREF } };
  setToken(null);
  setRole(null);
});

const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("apiFetch: 401 handling", () => {
  it("surfaces the backend reason for a rejected login instead of redirecting", async () => {
    setToken("token-1");
    setRole("student");
    globalThis.fetch = async () => jsonResponse(401, { detail: "Invalid email or password" });

    await assert.rejects(
      apiFetch("/auth/student/login", { method: "POST", body: "{}" }),
      /Invalid email or password/,
    );

    assert.equal(globalThis.window.location.href, INITIAL_HREF, "must not redirect away from the login form");
    assert.equal(getToken(), "token-1", "must not wipe the session for rejected credentials");
    assert.equal(globalThis.localStorage.getItem("pilotmate_role"), "student");
  });

  it("redirects to /login and clears the session for a 401 from a protected endpoint", async () => {
    setToken("token-1");
    setRole("admin");
    globalThis.fetch = async () => jsonResponse(401, { detail: "could not validate credentials" });

    await assert.rejects(apiFetch("/admin/stats"), /Session expired — please log in again\./);

    assert.equal(globalThis.window.location.href, "/login");
    assert.equal(getToken(), null, "expired session must be cleared");
    assert.equal(globalThis.localStorage.getItem("pilotmate_role"), null);
  });

  it("redirects for a 401 from a protected endpoint even with no stored session", async () => {
    globalThis.fetch = async () => jsonResponse(401, { detail: "Not authenticated" });

    await assert.rejects(apiFetch("/student/flights"), /Session expired/);

    assert.equal(globalThis.window.location.href, "/login");
  });

  it("reports a non-401 auth failure (e.g. signup conflict) with the backend detail", async () => {
    globalThis.fetch = async () => jsonResponse(400, { detail: "Email already registered" });

    await assert.rejects(
      apiFetch("/auth/student/signup", { method: "POST", body: "{}" }),
      /Email already registered/,
    );

    assert.equal(globalThis.window.location.href, INITIAL_HREF, "must not redirect on validation errors");
  });

  it("returns the payload on a successful login", async () => {
    globalThis.fetch = async () => jsonResponse(200, { access_token: "jwt", role: "student" });

    const data = await apiFetch("/auth/student/login", { method: "POST", body: "{}" });

    assert.equal(data.access_token, "jwt");
    assert.equal(globalThis.window.location.href, INITIAL_HREF);
  });
});

describe("isAdminSession", () => {
  it("is true only with a stored token and the admin role", () => {
    setToken("token-1");
    setRole("admin");
    assert.equal(isAdminSession(), true);
  });

  it("is false for non-admin roles", () => {
    setToken("token-1");
    for (const role of ["student", "instructor", "other"]) {
      setRole(role);
      assert.equal(isAdminSession(), false, `role=${role}`);
    }
  });

  it("is false when only the role claims admin (no token)", () => {
    setToken(null);
    setRole("admin");
    assert.equal(isAdminSession(), false);
  });

  it("is false when nothing is stored", () => {
    setToken(null);
    setRole(null);
    assert.equal(isAdminSession(), false);
  });
});

describe("studentRouteAccess", () => {
  it("sends visitors with no session to the login form", () => {
    assert.equal(studentRouteAccess(null, null), "login");
    assert.equal(studentRouteAccess("token-1", null), "login");
    assert.equal(studentRouteAccess(null, "student"), "login");
  });

  it("refuses an authenticated admin with a message instead of a redirect", () => {
    assert.equal(studentRouteAccess("token-1", "admin"), "message");
  });

  it("refuses other authenticated non-students too", () => {
    assert.equal(studentRouteAccess("token-1", "instructor"), "message");
    assert.equal(studentRouteAccess("token-1", "unexpected"), "message");
  });

  it("allows a student session through to the normal workspace", () => {
    assert.equal(studentRouteAccess("token-1", "student"), "allow");
  });

  it("never grants access to an unknown role (deny by default)", () => {
    for (const role of ["", "ADMIN", "admin", "guest"]) {
      assert.notEqual(studentRouteAccess("token-1", role || null), "allow", `role=${role}`);
    }
  });
});
