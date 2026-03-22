const FASTAPI_URL = process.env.FASTAPI_INTERNAL_URL || "http://localhost:8000";
const API_SECRET  = process.env.INTERNAL_API_SECRET  || "";

async function fastapiRequest<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${FASTAPI_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": API_SECRET,
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FastAPI ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

// Trigger ML analysis after listing photo upload
export async function analyzeListingPhoto(listingId: string, photoUrl: string) {
  return fastapiRequest("POST", "/listings/analyze", { listing_id: listingId, photo_url: photoUrl });
}

// Get price suggestion from XGBoost model
export async function getPriceSuggestion(params: {
  category: string;
  condition: string;
  title: string;
  location_state: string;
}) {
  return fastapiRequest("POST", "/ml/price-suggest", params);
}

// Submit listing to fraud scoring queue
export async function scoreFraud(listingId: string) {
  return fastapiRequest("POST", `/fraud/score/${listingId}`, {});
}

// Health check
export async function fastapiHealth() {
  return fastapiRequest("GET", "/health");
}
