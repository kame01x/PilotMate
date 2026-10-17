"use client";

// Same-origin proxy path (see rewrites in next.config.ts) — the Next server
// forwards to the loopback backend. Avoids CORS, IPv6/localhost quirks, and
// LAN-IP mismatches. Override with a full URL only for remote backends.
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api-proxy";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("pilotmate_token");
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem("pilotmate_token", token);
  else localStorage.removeItem("pilotmate_token");
}

export function getRole(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("pilotmate_role");
}

export function setRole(role: string | null) {
  if (typeof window === "undefined") return;
  if (role) localStorage.setItem("pilotmate_role", role);
  else localStorage.removeItem("pilotmate_role");
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.headers) Object.assign(headers, options.headers as Record<string, string>);
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch (e) {
    const cause = e instanceof Error ? e.message : String(e);
    throw new Error(`Cannot reach the backend at ${API_URL}. Is it running? (${cause})`);
  }
  if (res.status === 401) {
    setToken(null);
    setRole(null);
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Session expired — please log in again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (data as any).detail;
    const message =
      typeof detail === "string"
        ? detail
        : detail != null
          ? JSON.stringify(detail)
          : `Request failed with HTTP ${res.status}`;
    throw new Error(message);
  }
  return data;
}
