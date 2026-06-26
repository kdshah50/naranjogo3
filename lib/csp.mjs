/**
 * Content-Security-Policy directives for Naranjogo.
 *
 * - Browser scripts: Next.js bundles need 'unsafe-inline' / 'unsafe-eval' (known limitation).
 * - Maps (Leaflet): img-src allows https: so OSM tiles load.
 * - Sentry / Supabase / Stripe (future embeds): covered via connect-src / script-src allowances.
 *
 * Use CSP_MODE (see next.config.mjs): enforce | report | off
 */

export const CSP_POLICY = [
  "default-src 'self'",
  [
    "script-src",
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'",
    "https://vercel.live",
    "https://js.stripe.com",
    "https://us-assets.i.posthog.com",
    "https://*.posthog.com",
  ].join(" "),
  ["style-src", "'self'", "'unsafe-inline'", "https://fonts.googleapis.com"].join(" "),
  ["font-src", "'self'", "data:", "https://fonts.gstatic.com"].join(" "),
  ["img-src", "'self'", "data:", "blob:", "https:"].join(" "),
  ["connect-src", "'self'", "https:", "wss:", "https://vitals.vercel-insights.com", "https://*.ingest.sentry.io", "https://*.ingest.us.sentry.io"].join(" "),
  "frame-ancestors 'none'",
  "base-uri 'self'",
  ["form-action", "'self'", "https://checkout.stripe.com"].join(" "),
  "object-src 'none'",
].join("; ");

/** @deprecated Use CSP_POLICY — kept for grep/compatibility */
export const CSP_REPORT_ONLY = CSP_POLICY;
