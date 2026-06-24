import { NextRequest, NextResponse } from "next/server";
import { getTianguisJwtPayloadFromRequest } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

/** Public session probe for client UI (HttpOnly cookie is not readable in JS). */
export async function GET(req: NextRequest) {
  const p = await getTianguisJwtPayloadFromRequest(req);
  if (!p?.sub) {
    return NextResponse.json({ loggedIn: false });
  }
  return NextResponse.json({
    loggedIn: true,
    userId: p.sub,
    phone: typeof p.phone === "string" ? p.phone : undefined,
    badge: typeof p.badge === "string" ? p.badge : undefined,
  });
}
