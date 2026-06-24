"use client";

import { PostHogProvider as PHProvider } from "posthog-js/react";
import posthog from "posthog-js";
import { useEffect, useState } from "react";
import { POSTHOG_ACTIVE, POSTHOG_HOST, POSTHOG_KEY } from "@/lib/posthog-config";

export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!POSTHOG_ACTIVE) return;
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      person_profiles: "identified_only",
      capture_pageview: false,
      capture_pageleave: true,
    });
    setReady(true);
  }, []);

  if (!POSTHOG_ACTIVE || !ready) return <>{children}</>;
  return <PHProvider client={posthog}>{children}</PHProvider>;
}
