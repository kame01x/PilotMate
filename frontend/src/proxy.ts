import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const user = process.env.STAGING_AUTH_USER;
  const pass = process.env.STAGING_AUTH_PASS;

  if (!user || !pass) {
    if (process.env.RENDER === "true") {
      return new NextResponse("Staging authentication is not configured.", {
        status: 503,
      });
    }
    return NextResponse.next();
  }

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    const decoded = atob(auth.slice(6));
    const colonIndex = decoded.indexOf(":");
    if (colonIndex !== -1) {
      const requestUser = decoded.slice(0, colonIndex);
      const requestPass = decoded.slice(colonIndex + 1);
      if (requestUser === user && requestPass === pass) {
        return NextResponse.next();
      }
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="PilotMate staging", charset="UTF-8"',
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
