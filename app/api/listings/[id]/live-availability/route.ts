import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

const HORIZON_DAYS = 14;
const LIMIT = 64;

/** Public: upcoming slots for an active listing (same data as listing page). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const listingId = params.id;
    const supabase = createAdminSupabase();

    const { data: listing, error: le } = await supabase
      .from("listings")
      .select("id,status,calendar_sync_enabled,calendar_last_synced_at")
      .eq("id", listingId)
      .maybeSingle();

    if (le || !listing) {
      return NextResponse.json({ error: "Anuncio no encontrado" }, { status: 404 });
    }
    if (listing.status !== "active") {
      return NextResponse.json({ error: "Este anuncio no está activo" }, { status: 404 });
    }

    const now = new Date();
    const until = new Date(now.getTime() + HORIZON_DAYS * 86_400_000);

    const { data: rows } = await supabase
      .from("listing_live_availability_slots")
      .select("slot_start,slot_end")
      .eq("listing_id", listingId)
      .gte("slot_end", now.toISOString())
      .lte("slot_start", until.toISOString())
      .order("slot_start", { ascending: true })
      .limit(LIMIT);

    return NextResponse.json({
      calendarSyncEnabled: Boolean(listing.calendar_sync_enabled),
      calendarLastSyncedAt: listing.calendar_last_synced_at ?? null,
      slots: rows ?? [],
    });
  } catch (e) {
    console.error("[live-availability] GET", e);
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
