import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { rateLimitMemory } from "@/lib/rate-limit-memory";

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
