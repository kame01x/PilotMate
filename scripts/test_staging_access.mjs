import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { createRequire } from "node:module";
import http from "node:http";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next", { paths: ["./frontend"] });

const PORT = 3456;
const BASE = `http://localhost:${PORT}`;
const PATHS = ["/", "/api-proxy/health"];

// Stub backend so /api-proxy/health can return a real 200 through the rewrite
// without needing the FastAPI server running.
const stub = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok", stub: true }));
});
await new Promise((resolve) => stub.listen(0, "127.0.0.1", resolve));
const STUB_URL = `http://127.0.0.1:${stub.address().port}`;

async function testEndpoint(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  return res.status;
}

async function testPaths(expected, opts = {}) {
  const statuses = [];
  for (const path of PATHS) {
    statuses.push([path, await testEndpoint(path, opts)]);
  }
  console.log(`   ${statuses.map(([p, s]) => `${p}=${s}`).join("  ")} (expected ${expected})`);
  return statuses.every(([, s]) => s === expected);
}

async function waitForServer(retries = 20) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${BASE}/`);
      return true;
    } catch {
      await setTimeout(500);
    }
  }
  throw new Error("Server did not start");
}

async function runTest(name, env, testFn) {
  const proc = spawn(process.execPath, [nextBin, "start", "-p", String(PORT)], {
    cwd: "frontend",
    env: { ...process.env, ...env, NODE_ENV: "production", BACKEND_URL: STUB_URL },
    stdio: "ignore",
  });

  try {
    await waitForServer();
    const result = await testFn();
    console.log(`${result ? "PASS" : "FAIL"}: ${name}`);
    return result;
  } finally {
    proc.kill();
    await setTimeout(1000);
  }
}

async function main() {
  let allPassed = true;

  allPassed &= await runTest(
    "Missing creds on Render -> 503 (app + api-proxy)",
    { RENDER: "true", STAGING_AUTH_USER: "", STAGING_AUTH_PASS: "" },
    async () => await testPaths(503)
  );

  allPassed &= await runTest(
    "Missing creds locally -> 200 (dev mode, app + api-proxy)",
    { RENDER: "", STAGING_AUTH_USER: "", STAGING_AUTH_PASS: "" },
    async () => await testPaths(200)
  );

  allPassed &= await runTest(
    "Valid Basic auth -> 200 (app + api-proxy)",
    { RENDER: "true", STAGING_AUTH_USER: "testuser", STAGING_AUTH_PASS: "testpass" },
    async () => {
      const auth = "Basic " + Buffer.from("testuser:testpass").toString("base64");
      return await testPaths(200, { headers: { Authorization: auth } });
    }
  );

  allPassed &= await runTest(
    "Invalid Basic auth -> 401 (app + api-proxy)",
    { RENDER: "true", STAGING_AUTH_USER: "testuser", STAGING_AUTH_PASS: "testpass" },
    async () => {
      const auth = "Basic " + Buffer.from("wrong:wrong").toString("base64");
      return await testPaths(401, { headers: { Authorization: auth } });
    }
  );

  allPassed &= await runTest(
    "No auth header -> 401 (app + api-proxy)",
    { RENDER: "true", STAGING_AUTH_USER: "testuser", STAGING_AUTH_PASS: "testpass" },
    async () => await testPaths(401)
  );

  stub.close();
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
