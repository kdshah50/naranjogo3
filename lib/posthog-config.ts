/** PostHog project API key (browser-safe). Analytics runs only when this is set. */
export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim() ?? "";

/** Ingestion host — US cloud default; set to https://eu.i.posthog.com for EU projects. */
export const POSTHOG_HOST = (
  process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com"
).replace(/\/$/, "");

export const POSTHOG_ACTIVE = Boolean(POSTHOG_KEY);
