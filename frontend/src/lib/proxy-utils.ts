export const API_PROXY_PREFIX = "/api-proxy";
export const LOCAL_BACKEND_URL = "http://127.0.0.1:8000";
export const STAGING_BASIC_AUTH_REALM =
  'Basic realm="PilotMate staging", charset="UTF-8"';

type Env = Record<string, string | undefined>;

// True when the site should sit behind the staging Basic Auth gate.
// Vercel sets VERCEL="1" on every deployment, including Production, so the
// Vercel check must also look at VERCEL_ENV: only "preview" is gated.
// Render only hosts staging services (see render.yaml), so RENDER="true" is
// always gated. Vercel Production ("production") stays public.
export function isStagingHost(env: Env): boolean {
  if (env.RENDER === "true") return true;
  if (env.VERCEL !== "1") return false;
  return env.VERCEL_ENV === "preview";
}

// True in any deployed environment (Render, or Vercel outside `vercel dev`).
// There the API proxy must fail closed when BACKEND_URL is missing or invalid
// rather than silently falling back to a loopback backend that cannot exist.
// `vercel dev` (VERCEL_ENV="development") is local development, so it keeps
// the loopback fallback.
export function isDeployedHost(env: Env): boolean {
  if (env.RENDER === "true") return true;
  if (env.VERCEL !== "1") return false;
  return env.VERCEL_ENV !== "development";
}

export function isBasicAuthAuthorized(
  authHeader: string | null,
  expectedUser: string,
  expectedPass: string,
): boolean {
  if (!authHeader || !authHeader.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = atob(authHeader.slice(6).trim());
  } catch {
    return false;
  }
  const colonIndex = decoded.indexOf(":");
  if (colonIndex === -1) return false;
  return (
    decoded.slice(0, colonIndex) === expectedUser &&
    decoded.slice(colonIndex + 1) === expectedPass
  );
}

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

export function resolveBackendBase(
  raw: string | undefined,
  deployed: boolean,
): URL | null {
  const value = (raw ?? "").trim();
  if (!value) return deployed ? null : parseHttpUrl(LOCAL_BACKEND_URL);
  return parseHttpUrl(value);
}

export function buildBackendTarget(params: {
  backendUrl: string | undefined;
  pathname: string;
  search: string;
  deployed: boolean;
}): URL | null {
  const base = resolveBackendBase(params.backendUrl, params.deployed);
  if (!base) return null;

  const rest = params.pathname.startsWith(API_PROXY_PREFIX)
    ? params.pathname.slice(API_PROXY_PREFIX.length)
    : params.pathname;
  // Collapse leading slashes so "//host" cannot become a protocol-relative URL.
  const path = `/${rest.replace(/^\/+/, "")}`;
  const target = new URL(path + params.search, base);
  if (target.origin !== base.origin) return null;
  return target;
}
