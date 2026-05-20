import { NextResponse, type NextRequest } from "next/server";

const ADMIN_PROTECTED = /^\/(admin|api\/admin)(\/|$)/;
const SIWE_PROTECTED = /^\/(seller|buyer)\/dashboard(\/|$)/;
const SESSION_COOKIE = "tagamie_session";

function basicAuthUnauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Tagamie admin"',
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

function adminGate(req: NextRequest): NextResponse | undefined {
  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedPassword) return basicAuthUnauthorized();

  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return basicAuthUnauthorized();

  const decoded = atob(header.slice(6));
  const sep = decoded.indexOf(":");
  if (sep < 0) return basicAuthUnauthorized();
  const password = decoded.slice(sep + 1);
  if (password !== expectedPassword) return basicAuthUnauthorized();

  return undefined;
}

function siweGate(req: NextRequest): NextResponse | undefined {
  // Middleware can only check for the cookie's presence (iron-session
  // decryption requires Node APIs unavailable in the Edge runtime here).
  // Server components / route handlers will reject if the cookie is invalid.
  const sessionCookie = req.cookies.get(SESSION_COOKIE);
  if (!sessionCookie?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("auth", "required");
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return undefined;
}

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (ADMIN_PROTECTED.test(path)) {
    const denied = adminGate(req);
    if (denied) return denied;
    return NextResponse.next();
  }

  if (SIWE_PROTECTED.test(path)) {
    const denied = siweGate(req);
    if (denied) return denied;
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/seller/dashboard/:path*",
    "/buyer/dashboard/:path*",
  ],
};
