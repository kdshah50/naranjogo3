import { vercelDeploymentOrigin } from "@/lib/vercel-origin";

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
 * - **Vercel non-production:** branch/deployment URL (never apex) for WhatsApp + deep links.
 * - **Production:** `NEXT_PUBLIC_APP_URL` or apex default.
 * - **Local:** `NEXT_PUBLIC_APP_URL` if set, else apex default.
 */
export function getPublicAppUrl(): string {
  const vercelEnv = process.env.VERCEL_ENV;
  const deploymentOrigin = vercelDeploymentOrigin();

  /** Production WhatsApp / ticket links always use the canonical apex, never *.vercel.app. */
  if (vercelEnv === "production") {
    const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (configured) return normalizeOrigin(configured);
    return DEFAULT;
  }

  if (vercelEnv && vercelEnv !== "production" && deploymentOrigin) {
    return deploymentOrigin;
  }

  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return normalizeOrigin(configured);
  if (deploymentOrigin) return deploymentOrigin;
  return DEFAULT;
}
