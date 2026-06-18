const DEFAULT = "https://naranjogo.com.mx";

function normalizeOrigin(raw: string): string {
  let u = raw.trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    new URL(u);
    return u;
  } catch {
    return DEFAULT;
  }
}

/**
 * Public site origin (no trailing slash).
 *
 * - **Production:** `NEXT_PUBLIC_APP_URL` or apex default (`naranjogo.com.mx`).
 * - **Vercel Preview:** this deployment's `VERCEL_URL` so WhatsApp/cron links match the branch under test.
 * - **Local:** `NEXT_PUBLIC_APP_URL` if set, else default apex.
 */
export function getPublicAppUrl(): string {
  const vercelEnv = process.env.VERCEL_ENV;
  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelEnv === "preview" && vercelUrl) {
    return normalizeOrigin(vercelUrl);
  }

  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) return DEFAULT;
  return normalizeOrigin(configured);
}
