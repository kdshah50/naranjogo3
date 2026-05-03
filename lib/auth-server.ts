import "server-only";

import { NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { jwtVerify } from "jose";
import { getJwtSecretBytes } from "@/lib/jwt-secret";
import { idMatchVariantsForIn as idMatchVariantsForInImpl } from "@/lib/user-id-variants";

export const TIANGUIS_TOKEN_COOKIE = "tianguis_token";

export type TianguisJwtPayload = {
  sub?: string;
  phone?: string;
  badge?: string;
  exp?: number;
};

/** JWT sub vs Supabase uuids may differ in letter casing; never use raw `===` for identity. */
export function isSameUserId(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (a == null || b == null) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** For PostgREST `.in()` on TEXT uuid columns — `.eq` is case-sensitive vs normalized JWT sub. */
export const idMatchVariantsForIn = idMatchVariantsForInImpl;

async function verifyTianguisCookie(token: string) {
  let secret: Uint8Array;
  try {
    secret = getJwtSecretBytes();
  } catch {
    return null;
  }
  try {
    return await jwtVerify(token, secret);
  } catch {
    return null;
  }
}

export async function getTianguisJwtPayloadFromRequest(req: NextRequest): Promise<TianguisJwtPayload | null> {
  const token = req.cookies.get(TIANGUIS_TOKEN_COOKIE)?.value;
  if (!token) return null;
  const result = await verifyTianguisCookie(token);
  if (!result) return null;
  return result.payload as TianguisJwtPayload;
}

export async function getUserIdFromRequest(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(TIANGUIS_TOKEN_COOKIE)?.value;
  if (!token) return null;
  const result = await verifyTianguisCookie(token);
  if (!result) return null;
  const sub = result.payload.sub;
  if (typeof sub !== "string" || sub.length === 0) return null;
  return sub.trim().toLowerCase();
}

export function createAdminSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase env");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
