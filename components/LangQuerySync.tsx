"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NARANJO_LANG_COOKIE, persistAppLangClient } from "@/lib/i18n-lang";

/** Keeps `?lang=` in sync with localStorage so server pages pick up the chosen language. */
function LangQuerySyncInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => {
    const urlLang = params.get("lang");
    if (urlLang === "en" || urlLang === "es") {
      persistAppLangClient(urlLang);
      return;
    }

    let stored: "en" | "es" | null = null;
    try {
      const s = localStorage.getItem(NARANJO_LANG_COOKIE);
      if (s === "en" || s === "es") stored = s;
    } catch {
      stored = null;
    }
    if (stored !== "en") return;

    persistAppLangClient("en");
    const p = new URLSearchParams(params.toString());
    p.set("lang", "en");
    router.replace(`${pathname}?${p.toString()}`);
  }, [pathname, params, router]);

  return null;
}

export default function LangQuerySync() {
  return (
    <Suspense fallback={null}>
      <LangQuerySyncInner />
    </Suspense>
  );
}
