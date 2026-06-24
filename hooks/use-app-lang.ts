"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Lang } from "@/lib/i18n-lang";
import { NARANJO_LANG_COOKIE, persistAppLangClient } from "@/lib/i18n-lang";

/**
 * Resolves UI language: `?lang=` (if present) wins, then localStorage `naranjo_lang`, else Spanish.
 * When the URL specifies a language, it is persisted to localStorage so routes without the query stay consistent.
 */
export function useAppLang(): Lang {
  const params = useSearchParams();
  const raw = params.get("lang");
  const fromUrl = raw === "en" || raw === "es" ? raw : null;
  const [fromStorage, setFromStorage] = useState<Lang | null>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem(NARANJO_LANG_COOKIE);
      if (s === "en" || s === "es") setFromStorage(s);
    } catch {
      setFromStorage(null);
    }
  }, []);

  useEffect(() => {
    if (fromUrl) {
      persistAppLangClient(fromUrl);
    }
  }, [fromUrl]);

  if (fromUrl) return fromUrl;
  if (fromStorage) return fromStorage;
  return "es";
}

/** Updates language in the URL (and localStorage via useAppLang / Header rules) */
export function useAppLangActions() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setLang = (l: Lang) => {
    persistAppLangClient(l);
    const p = new URLSearchParams(params.toString());
    p.set("lang", l);
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  };

  return { setLang };
}
