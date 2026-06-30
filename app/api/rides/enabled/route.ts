import { NextResponse } from "next/server";
import { isRidesEnabled } from "@/lib/rides/flags";

export const dynamic = "force-dynamic";

/** Lightweight probe for ride pages — avoids hostname guessing on custom domains. */
export async function GET() {
  return NextResponse.json(
    { enabled: isRidesEnabled() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
