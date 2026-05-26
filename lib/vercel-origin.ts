/**
 * Stable HTTPS origin for the current Vercel deployment.
 * Prefer VERCEL_BRANCH_URL (same for every deploy on a branch) over VERCEL_URL (per-deploy).
 */
export function vercelDeploymentOrigin(): string | null {
  const raw =
    process.env.VERCEL_BRANCH_URL?.trim() || process.env.VERCEL_URL?.trim() || "";
  if (!raw) return null;
  const host = raw.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  if (!host) return null;
  try {
    return new URL(`https://${host}`).origin;
  } catch {
    return null;
  }
}

export function isVercelPreview(): boolean {
  return process.env.VERCEL_ENV === "preview";
}
