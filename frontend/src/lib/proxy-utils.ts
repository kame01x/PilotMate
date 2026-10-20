export const API_PROXY_PREFIX = "/api-proxy";
export const LOCAL_BACKEND_URL = "http://127.0.0.1:8000";
export const STAGING_BASIC_AUTH_REALM =
  'Basic realm="PilotMate staging", charset="UTF-8"';

type Env = Record<string, string | undefined>;

export function isStagingHost(env: Env): boolean {
  return env.RENDER === "true" || env.VERCEL === "1";
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
  staging: boolean,
): URL | null {
  const value = (raw ?? "").trim();
  if (!value) return staging ? null : parseHttpUrl(LOCAL_BACKEND_URL);
  return parseHttpUrl(value);
}

export function buildBackendTarget(params: {
  backendUrl: string | undefined;
  pathname: string;
  search: string;
  staging: boolean;
}): URL | null {
  const base = resolveBackendBase(params.backendUrl, params.staging);
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
