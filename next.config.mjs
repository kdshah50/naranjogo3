import { withSentryConfig } from "@sentry/nextjs";
import { CSP_POLICY } from "./lib/csp.mjs";

/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

/** enforce | report | off — default enforce (production). Use report temporarily if diagnosing breakage. */
const cspMode = (process.env.CSP_MODE ?? "enforce").trim().toLowerCase();

function stablePreviewOrigin() {
  const raw = process.env.VERCEL_BRANCH_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (!raw) return "";
  const host = raw.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return host ? `https://${host}` : "";
}

const nextConfig = {
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? "development",
    NEXT_PUBLIC_STABLE_ORIGIN: stablePreviewOrigin(),
  },
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "imagedelivery.net" },
    ],
  },
  async headers() {
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    if (isProd) {
      security.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      });
      if (cspMode !== "off") {
        if (cspMode === "report") {
          security.push({
            key: "Content-Security-Policy-Report-Only",
            value: CSP_POLICY,
          });
        } else {
          security.push({
            key: "Content-Security-Policy",
            value: CSP_POLICY,
          });
        }
      }
    }
    return [
      { source: "/:path*", headers: security },
      {
        source: "/auth/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
  async rewrites() {
    // Internal ML/listings API — protect upstream with INTERNAL_API_SECRET (FastAPI must verify).
    return [
      {
        source: "/api/fastapi/:path*",
        destination: `${process.env.FASTAPI_INTERNAL_URL || "http://localhost:8000"}/:path*`,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/my-booking",
        destination: "/my-bookings",
        permanent: true,
      },
    ];
  },
};

/** Source map upload is off until SENTRY_AUTH_TOKEN is set in CI/Vercel. */
export default withSentryConfig(nextConfig, {
  silent: true,
  sourcemaps: { disable: true },
});
