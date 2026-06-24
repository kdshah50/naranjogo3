"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import posthog from "posthog-js";
import { POSTHOG_ACTIVE } from "@/lib/posthog-config";

/** Sends `$pageview` on App Router navigations (PostHog does not auto-track Next.js client routes). */
export default function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!POSTHOG_ACTIVE || !pathname) return;
    let url = window.origin + pathname;
    const qs = searchParams?.toString();
    if (qs) url += `?${qs}`;
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}
