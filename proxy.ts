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

/**
 * Constant-time string comparison for the Edge runtime (review item #5).
 *
 * `node:crypto.timingSafeEqual` is unavailable here, so we hash both inputs
 * via SubtleCrypto (SHA-256 produces fixed-length output, eliminating the
 * length side-channel) and XOR the resulting bytes. Identical inputs hash
 * to identical bytes; differing inputs leak no length or prefix info.
 */
async function timingSafeEqualEdge(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [aHash, bHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const av = new Uint8Array(aHash);
  const bv = new Uint8Array(bHash);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}

async function adminGate(req: NextRequest): Promise<NextResponse | undefined> {
  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedPassword) return basicAuthUnauthorized();

  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return basicAuthUnauthorized();

  const decoded = atob(header.slice(6));
  const sep = decoded.indexOf(":");
  if (sep < 0) return basicAuthUnauthorized();
  const password = decoded.slice(sep + 1);
  if (!(await timingSafeEqualEdge(password, expectedPassword))) {
    return basicAuthUnauthorized();
  }

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

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (ADMIN_PROTECTED.test(path)) {
    const denied = await adminGate(req);
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
