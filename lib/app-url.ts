import { isVercelPreview, vercelDeploymentOrigin } from "@/lib/vercel-origin";

const DEFAULT = "https://naranjogo.com.mx";

/**
 * Public site origin (no trailing slash).
 *
 * On Vercel **preview**, uses the stable branch hostname (`VERCEL_BRANCH_URL`) so
 * WhatsApp links and bookmarks do not change on every deploy. Set `NEXT_PUBLIC_APP_URL`
 * only when you need a custom staging domain (e.g. staging.naranjogo.com.mx).
 */
export function getPublicAppUrl(): string {
  if (isVercelPreview()) {
    const vercel = vercelDeploymentOrigin();
    if (vercel) return vercel;
  }

  let u = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!u) {
    const vercel = vercelDeploymentOrigin();
    if (vercel) return vercel;
    return DEFAULT;
  }
  u = u.replace(/\/$/, "");
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    new URL(u);
    return u;
  } catch {
    return DEFAULT;
  }
}
