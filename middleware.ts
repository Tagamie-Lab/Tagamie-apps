import { NextResponse, type NextRequest } from "next/server";

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Tagamie admin"',
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

export function middleware(req: NextRequest) {
  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedPassword) return unauthorized();

  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return unauthorized();

  const decoded = atob(header.slice(6));
  const sep = decoded.indexOf(":");
  if (sep < 0) return unauthorized();
  const password = decoded.slice(sep + 1);
  if (password !== expectedPassword) return unauthorized();

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
