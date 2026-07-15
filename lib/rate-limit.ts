import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { clientIpFromHeaders, rateLimitMemory } from "@/lib/rate-limit-memory";

const OTP_IP_LIMIT = 25;
const OTP_IP_WINDOW_MS = 15 * 60 * 1000;

let distributed: Ratelimit | null | undefined;

function getSendOtpIpLimiter(): Ratelimit | null {
  if (distributed !== undefined) return distributed;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    distributed = null;
    return null;
  }
  try {
    const redis = new Redis({ url, token });
    distributed = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(OTP_IP_LIMIT, "15 m"),
      prefix: "ratelimit/ng/send-otp-ip",
    });
    return distributed;
  } catch {
    distributed = null;
    return null;
  }
}

/**
 * Distributed IP limit for OTP send when Upstash env is set; otherwise in-memory (per instance).
 */
export async function rateLimitSendOtpByIp(ip: string): Promise<{ ok: boolean; retryAfterMs?: number }> {
  const rl = getSendOtpIpLimiter();
  if (rl) {
    const { success, reset } = await rl.limit(ip);
    if (!success) {
      const retryAfterMs = typeof reset === "number" ? Math.max(0, reset - Date.now()) : OTP_IP_WINDOW_MS;
      return { ok: false, retryAfterMs };
    }
    return { ok: true };
  }
  return rateLimitMemory(`send-otp-ip:${ip}`, OTP_IP_LIMIT, OTP_IP_WINDOW_MS);
}

const ADMIN_PIN_IP_LIMIT = 30;
const ADMIN_PIN_WINDOW_MS = 15 * 60 * 1000;

let adminPinIpLimit: Ratelimit | null | undefined;

function getAdminPinIpLimiter(): Ratelimit | null {
  if (adminPinIpLimit !== undefined) return adminPinIpLimit;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    adminPinIpLimit = null;
    return null;
  }
  try {
    const redis = new Redis({ url, token });
    adminPinIpLimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(ADMIN_PIN_IP_LIMIT, "15 m"),
      prefix: "ratelimit/ng/admin-pin-ip",
    });
    return adminPinIpLimit;
  } catch {
    adminPinIpLimit = null;
    return null;
  }
}

/** Brute-force protection for /api/admin/verify-pin (IP-based). */
export async function rateLimitAdminPinByIp(ip: string): Promise<{ ok: boolean; retryAfterMs?: number }> {
  const key = ip.trim() || "unknown";
  const rl = getAdminPinIpLimiter();
  if (rl) {
    const { success, reset } = await rl.limit(key);
    if (!success) {
      const retryAfterMs = typeof reset === "number" ? Math.max(0, reset - Date.now()) : ADMIN_PIN_WINDOW_MS;
      return { ok: false, retryAfterMs };
    }
    return { ok: true };
  }
  return rateLimitMemory(`admin-pin-ip:${key}`, ADMIN_PIN_IP_LIMIT, ADMIN_PIN_WINDOW_MS);
}

export { clientIpFromHeaders };

/** Listing creation: burst + daily cap per seller (abuse / duplicate farming). */
const LISTING_CREATE_HOUR_LIMIT = 8;
const LISTING_CREATE_DAY_LIMIT = 25;
const LISTING_CREATE_HOUR_MS = 60 * 60 * 1000;
const LISTING_CREATE_DAY_MS = 24 * 60 * 60 * 1000;

let listingHourLimit: Ratelimit | null | undefined;
let listingDayLimit: Ratelimit | null | undefined;

function getListingCreateLimiters(): { hour: Ratelimit; day: Ratelimit } | null {
  if (listingHourLimit !== undefined && listingDayLimit !== undefined) {
    if (!listingHourLimit || !listingDayLimit) return null;
    return { hour: listingHourLimit, day: listingDayLimit };
  }
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    listingHourLimit = null;
    listingDayLimit = null;
    return null;
  }
  try {
    const redis = new Redis({ url, token });
    listingHourLimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(LISTING_CREATE_HOUR_LIMIT, "1 h"),
      prefix: "ratelimit/ng/listing-create-hour",
    });
    listingDayLimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(LISTING_CREATE_DAY_LIMIT, "24 h"),
      prefix: "ratelimit/ng/listing-create-day",
    });
    return { hour: listingHourLimit, day: listingDayLimit };
  } catch {
    listingHourLimit = null;
    listingDayLimit = null;
    return null;
  }
}

export type ListingCreateRateResult =
  | { ok: true }
  | { ok: false; retryAfterMs: number; reason: "hour" | "day" };

/**
 * Rate-limit new listing POSTs per authenticated seller user.
 * Uses Upstash when configured; otherwise in-memory (per instance).
 */
export async function rateLimitListingCreateByUser(userId: string): Promise<ListingCreateRateResult> {
  const key = userId.trim().toLowerCase();
  if (!key) return { ok: true };

  const dist = getListingCreateLimiters();
  if (dist) {
    const h = await dist.hour.limit(key);
    if (!h.success) {
      const retryAfterMs = typeof h.reset === "number" ? Math.max(0, h.reset - Date.now()) : LISTING_CREATE_HOUR_MS;
      return { ok: false, retryAfterMs, reason: "hour" };
    }
    const d = await dist.day.limit(key);
    if (!d.success) {
      const retryAfterMs = typeof d.reset === "number" ? Math.max(0, d.reset - Date.now()) : LISTING_CREATE_DAY_MS;
      return { ok: false, retryAfterMs, reason: "day" };
    }
    return { ok: true };
  }

  const hour = rateLimitMemory(`listing-create-hour:${key}`, LISTING_CREATE_HOUR_LIMIT, LISTING_CREATE_HOUR_MS);
  if (!hour.ok) return { ok: false, retryAfterMs: hour.retryAfterMs ?? LISTING_CREATE_HOUR_MS, reason: "hour" };

  const day = rateLimitMemory(`listing-create-day:${key}`, LISTING_CREATE_DAY_LIMIT, LISTING_CREATE_DAY_MS);
  if (!day.ok) return { ok: false, retryAfterMs: day.retryAfterMs ?? LISTING_CREATE_DAY_MS, reason: "day" };

  return { ok: true };
}

const DRIVER_LOCATION_LIMIT = 15;
const DRIVER_LOCATION_WINDOW_MS = 60 * 1000;

let driverLocationDistributed: Ratelimit | null | undefined;

function getDriverLocationLimiter(): Ratelimit | null {
  if (driverLocationDistributed !== undefined) return driverLocationDistributed;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    driverLocationDistributed = null;
    return null;
  }
  try {
    const redis = new Redis({ url, token });
    driverLocationDistributed = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(DRIVER_LOCATION_LIMIT, "1 m"),
      prefix: "ratelimit/ng/driver-location",
    });
    return driverLocationDistributed;
  } catch {
    driverLocationDistributed = null;
    return null;
  }
}

/** ~10s GPS ping with headroom — per driver session + IP. */
export async function rateLimitDriverLocation(
  key: string,
): Promise<{ ok: boolean; retryAfterMs?: number }> {
  const rl = getDriverLocationLimiter();
  if (rl) {
    const { success, reset } = await rl.limit(key);
    if (!success) {
      const retryAfterMs =
        typeof reset === "number" ? Math.max(0, reset - Date.now()) : DRIVER_LOCATION_WINDOW_MS;
      return { ok: false, retryAfterMs };
    }
    return { ok: true };
  }
  return rateLimitMemory(
    `driver-location:${key}`,
    DRIVER_LOCATION_LIMIT,
    DRIVER_LOCATION_WINDOW_MS,
  );
}
