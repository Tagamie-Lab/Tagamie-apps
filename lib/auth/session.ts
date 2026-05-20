import "server-only";
import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";

export type SessionData = {
  address?: string;
  chainId?: number;
  issuedAt?: string;
};

const SESSION_COOKIE = "tagamie_session";

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET is missing or too short (≥32 chars required). Set it in .env.local",
    );
  }
  return secret;
}

function sessionOptions(): SessionOptions {
  return {
    cookieName: SESSION_COOKIE,
    password: getSessionSecret(),
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    },
  };
}

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions());
}

export async function destroySession() {
  const session = await getSession();
  session.destroy();
}
