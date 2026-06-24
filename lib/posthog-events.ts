import posthog from "posthog-js";
import { POSTHOG_ACTIVE } from "@/lib/posthog-config";

/** Fire a custom PostHog event from client components (no-op when analytics is disabled). */
export function capturePostHogEvent(
  event: string,
  properties?: Record<string, string | number | boolean | null | undefined>,
) {
  if (!POSTHOG_ACTIVE || typeof window === "undefined") return;
  posthog.capture(event, properties);
}
