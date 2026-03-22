import { NextRequest, NextResponse } from "next/server";
import { getPriceSuggestion } from "@/lib/fastapi-client";

// POST /api/ml — get AI price suggestion from FastAPI XGBoost model
export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body.category || !body.condition || !body.title) {
    return NextResponse.json(
      { error: "category, condition, title required" },
      { status: 400 }
    );
  }

  try {
    const result = await getPriceSuggestion({
      category:       body.category,
      condition:      body.condition,
      title:          body.title,
      location_state: body.location_state ?? "CDMX",
    });
    return NextResponse.json(result);
  } catch (err: any) {
    // FastAPI down — return null gracefully so UI still works
    console.warn("FastAPI ML unavailable:", err.message);
    return NextResponse.json({ suggested_price_mxn: null, comparables_count: 0 });
  }
}
