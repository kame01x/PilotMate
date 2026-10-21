import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  API_PROXY_PREFIX,
  STAGING_BASIC_AUTH_REALM,
  buildBackendTarget,
  isBasicAuthAuthorized,
  isDeployedHost,
  isStagingHost,
} from "@/lib/proxy-utils";

export function proxy(request: NextRequest) {
  const staging = isStagingHost(process.env);
  const user = process.env.STAGING_AUTH_USER;
  const pass = process.env.STAGING_AUTH_PASS;

  if (staging) {
    if (!user || !pass) {
      return new NextResponse("Staging authentication is not configured.", {
        status: 503,
      });
    }

    const auth = request.headers.get("authorization");
    if (!isBasicAuthAuthorized(auth, user, pass)) {
      return new NextResponse("Authentication required", {
        status: 401,
        headers: {
          "WWW-Authenticate": STAGING_BASIC_AUTH_REALM,
        },
      });
    }
  }

  const { pathname } = request.nextUrl;
  if (
    pathname === API_PROXY_PREFIX ||
    pathname.startsWith(`${API_PROXY_PREFIX}/`)
  ) {
    const target = buildBackendTarget({
      backendUrl: process.env.BACKEND_URL,
      pathname,
      search: request.nextUrl.search,
      deployed: isDeployedHost(process.env),
    });
    if (!target) {
      return new NextResponse("API proxy is not configured.", {
        status: 503,
      });
    }

    const headers = new Headers(request.headers);
    const forwardedAuth = headers.get("authorization");
    if (forwardedAuth?.startsWith("Basic ")) {
      headers.delete("authorization");
    }
    return NextResponse.rewrite(target, { request: { headers } });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
