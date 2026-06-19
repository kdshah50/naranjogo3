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

function vercelDeploymentOrigin(): string | null {
  const branchUrl = process.env.VERCEL_BRANCH_URL?.trim();
  const deploymentUrl = process.env.VERCEL_URL?.trim();
  const host = branchUrl || deploymentUrl;
  if (!host) return null;
  return normalizeOrigin(host);
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

  if (vercelEnv && vercelEnv !== "production" && deploymentOrigin) {
    return deploymentOrigin;
  }

  if (deploymentOrigin && /\.vercel\.app$/i.test(deploymentOrigin)) {
    return deploymentOrigin;
  }

  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) return DEFAULT;
  return normalizeOrigin(configured);
}
