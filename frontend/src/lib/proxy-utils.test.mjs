import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  API_PROXY_PREFIX,
  LOCAL_BACKEND_URL,
  buildBackendTarget,
  isBasicAuthAuthorized,
  isDeployedHost,
  isStagingHost,
  resolveBackendBase,
} from "./proxy-utils.ts";

const basic = (creds) => `Basic ${Buffer.from(creds).toString("base64")}`;

describe("isStagingHost", () => {
  it("is true on Render staging", () => {
    assert.equal(isStagingHost({ RENDER: "true" }), true);
  });
  it("is true on Vercel preview deployments", () => {
    assert.equal(isStagingHost({ VERCEL: "1", VERCEL_ENV: "preview" }), true);
  });
  it("is false on Vercel production deployments", () => {
    assert.equal(
      isStagingHost({ VERCEL: "1", VERCEL_ENV: "production" }),
      false,
    );
  });
  it("is false on Vercel development (vercel dev)", () => {
    assert.equal(
      isStagingHost({ VERCEL: "1", VERCEL_ENV: "development" }),
      false,
    );
  });
  it("is false locally", () => {
    assert.equal(isStagingHost({}), false);
    assert.equal(isStagingHost({ RENDER: "false" }), false);
  });
});

describe("isDeployedHost", () => {
  it("is true on Render", () => {
    assert.equal(isDeployedHost({ RENDER: "true" }), true);
  });
  it("is true on Vercel production", () => {
    assert.equal(
      isDeployedHost({ VERCEL: "1", VERCEL_ENV: "production" }),
      true,
    );
  });
  it("is true on Vercel preview", () => {
    assert.equal(isDeployedHost({ VERCEL: "1", VERCEL_ENV: "preview" }), true);
  });
  it("is false on vercel dev (local loopback fallback allowed)", () => {
    assert.equal(
      isDeployedHost({ VERCEL: "1", VERCEL_ENV: "development" }),
      false,
    );
  });
  it("is false locally", () => {
    assert.equal(isDeployedHost({}), false);
    assert.equal(isDeployedHost({ RENDER: "false" }), false);
  });
});

describe("isBasicAuthAuthorized", () => {
  it("accepts valid credentials", () => {
    assert.equal(isBasicAuthAuthorized(basic("alice:s3cret"), "alice", "s3cret"), true);
  });
  it("splits on the first colon only", () => {
    assert.equal(isBasicAuthAuthorized(basic("alice:pa:ss"), "alice", "pa:ss"), true);
  });
  it("rejects a wrong password", () => {
    assert.equal(isBasicAuthAuthorized(basic("alice:wrong"), "alice", "s3cret"), false);
  });
  it("rejects a wrong user", () => {
    assert.equal(isBasicAuthAuthorized(basic("bob:s3cret"), "alice", "s3cret"), false);
  });
  it("rejects a missing header", () => {
    assert.equal(isBasicAuthAuthorized(null, "alice", "s3cret"), false);
  });
  it("rejects non-Basic schemes", () => {
    assert.equal(isBasicAuthAuthorized("Bearer token", "alice", "s3cret"), false);
  });
  it("rejects undecodable base64", () => {
    assert.equal(isBasicAuthAuthorized("Basic !!!not-base64!!!", "alice", "s3cret"), false);
  });
  it("rejects base64 without a colon", () => {
    assert.equal(isBasicAuthAuthorized(basic("nocolon"), "alice", "s3cret"), false);
  });
});

describe("resolveBackendBase", () => {
  it("fails closed in deployed environments when missing", () => {
    assert.equal(resolveBackendBase(undefined, true), null);
    assert.equal(resolveBackendBase("", true), null);
    assert.equal(resolveBackendBase("   ", true), null);
  });
  it("falls back to loopback for local development", () => {
    assert.equal(resolveBackendBase(undefined, false)?.href, LOCAL_BACKEND_URL + "/");
    assert.equal(resolveBackendBase("", false)?.href, LOCAL_BACKEND_URL + "/");
  });
  it("parses a valid https backend and trims whitespace", () => {
    const url = resolveBackendBase("  https://api.example.com  ", true);
    assert.equal(url?.href, "https://api.example.com/");
  });
  it("accepts http backends", () => {
    assert.equal(resolveBackendBase("http://10.0.0.5:8000", true)?.port, "8000");
  });
  it("rejects invalid values everywhere", () => {
    assert.equal(resolveBackendBase("not a url", true), null);
    assert.equal(resolveBackendBase("not a url", false), null);
  });
  it("rejects non-http protocols", () => {
    assert.equal(resolveBackendBase("ftp://example.com", true), null);
    assert.equal(resolveBackendBase("javascript:alert(1)", false), null);
  });
});

describe("buildBackendTarget", () => {
  const deployed = { deployed: true, backendUrl: "https://backend.example.com" };

  it("strips the /api-proxy prefix and preserves the path", () => {
    const target = buildBackendTarget({
      ...deployed,
      pathname: `${API_PROXY_PREFIX}/auth/student/login`,
      search: "",
    });
    assert.equal(target?.href, "https://backend.example.com/auth/student/login");
  });
  it("preserves the query string", () => {
    const target = buildBackendTarget({
      ...deployed,
      pathname: `${API_PROXY_PREFIX}/admin/users`,
      search: "?page=2&limit=10",
    });
    assert.equal(
      target?.href,
      "https://backend.example.com/admin/users?page=2&limit=10",
    );
    assert.equal(target?.search, "?page=2&limit=10");
  });
  it("preserves percent-encoded path segments", () => {
    const target = buildBackendTarget({
      ...deployed,
      pathname: `${API_PROXY_PREFIX}/flight%20log`,
      search: "",
    });
    assert.equal(target?.pathname, "/flight%20log");
  });
  it("maps the bare prefix and trailing slash to the backend root", () => {
    assert.equal(
      buildBackendTarget({ ...deployed, pathname: API_PROXY_PREFIX, search: "" })?.href,
      "https://backend.example.com/",
    );
    assert.equal(
      buildBackendTarget({ ...deployed, pathname: `${API_PROXY_PREFIX}/`, search: "" })?.href,
      "https://backend.example.com/",
    );
  });
  it("cannot be turned into an open proxy via protocol-relative paths", () => {
    const target = buildBackendTarget({
      ...deployed,
      pathname: `${API_PROXY_PREFIX}//evil.com/steal`,
      search: "",
    });
    assert.equal(target?.origin, "https://backend.example.com");
    assert.equal(target?.pathname, "/evil.com/steal");
  });
  it("keeps traversal attempts on the backend origin", () => {
    const target = buildBackendTarget({
      ...deployed,
      pathname: `${API_PROXY_PREFIX}/../../etc/passwd`,
      search: "",
    });
    assert.equal(target?.origin, "https://backend.example.com");
    assert.equal(target?.pathname, "/etc/passwd");
  });
  it("fails closed in deployed environments when BACKEND_URL is missing", () => {
    assert.equal(
      buildBackendTarget({
        backendUrl: undefined,
        pathname: `${API_PROXY_PREFIX}/health`,
        search: "",
        deployed: true,
      }),
      null,
    );
  });
  it("uses the loopback fallback locally when BACKEND_URL is missing", () => {
    const target = buildBackendTarget({
      backendUrl: undefined,
      pathname: `${API_PROXY_PREFIX}/health`,
      search: "",
      deployed: false,
    });
    assert.equal(target?.href, "http://127.0.0.1:8000/health");
  });
  it("fails closed when BACKEND_URL is invalid, even locally", () => {
    assert.equal(
      buildBackendTarget({
        backendUrl: "not a url",
        pathname: `${API_PROXY_PREFIX}/health`,
        search: "",
        deployed: false,
      }),
      null,
    );
  });
  it("fails closed on Vercel production when BACKEND_URL is missing", () => {
    // Vercel Production is not "staging", but the proxy must still fail closed
    // rather than proxying to a loopback address that cannot exist there.
    assert.equal(
      isDeployedHost({ VERCEL: "1", VERCEL_ENV: "production" }),
      true,
    );
    assert.equal(
      buildBackendTarget({
        backendUrl: undefined,
        pathname: `${API_PROXY_PREFIX}/health`,
        search: "",
        deployed: isDeployedHost({ VERCEL: "1", VERCEL_ENV: "production" }),
      }),
      null,
    );
  });
});
