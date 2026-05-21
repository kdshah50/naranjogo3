import type { NextRequest } from "next/server";

/**
 * Shared secret for ride-ai / internal tool calls to Next.js rides APIs.
 * Uses the same env var as ml-service and FastAPI embed routes.
 */
export function internalApiSecret(): string {
  return String(process.env.INTERNAL_API_SECRET ?? "").trim();
}

export function verifyInternalSecret(req: NextRequest): boolean {
  const expected = internalApiSecret();
  if (!expected) return false;
  const got = String(req.headers.get("x-internal-secret") ?? "").trim();
  return got.length > 0 && got === expected;
}

export function internalSecretHeaders(): Record<string, string> {
  const secret = internalApiSecret();
  if (!secret) return {};
  return { "x-internal-secret": secret };
}
