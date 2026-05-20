import { NextRequest } from "next/server";
import { z } from "zod";
import { verifySiwe } from "@/lib/auth/siwe";
import { getSession } from "@/lib/auth/session";
import { isSupportedChainId } from "@/lib/auth/chains";

const bodySchema = z.object({
  message: z.string().min(1),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await verifySiwe(
    parsed.data.message,
    parsed.data.signature as `0x${string}`,
  );
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 401 });
  }

  if (!isSupportedChainId(result.chainId)) {
    return Response.json(
      {
        error: "unsupported_chain",
        chainId: result.chainId,
      },
      { status: 400 },
    );
  }

  const session = await getSession();
  session.address = result.address;
  session.chainId = result.chainId;
  session.issuedAt = new Date().toISOString();
  await session.save();

  return Response.json({
    ok: true,
    address: result.address,
    chainId: result.chainId,
  });
}
