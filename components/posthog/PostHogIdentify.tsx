"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { POSTHOG_ACTIVE } from "@/lib/posthog-config";

/** Links PostHog persons to logged-in users (phone suffix only — no PII in traits). */
export default function PostHogIdentify() {
  useEffect(() => {
    if (!POSTHOG_ACTIVE) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { credentials: "same-origin" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          loggedIn?: boolean;
          userId?: string;
          phone?: string;
        };
        if (cancelled) return;
        if (data.loggedIn && data.userId) {
          posthog.identify(data.userId, {
            phone_last4: data.phone?.slice(-4) ?? undefined,
          });
        } else {
          posthog.reset();
        }
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
