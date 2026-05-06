"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useAppLang } from "@/hooks/use-app-lang";
import { formatDateTimeShort } from "@/lib/locale-format";
import type { Lang } from "@/lib/i18n-lang";

type Thread = {
  conversationId: string;
  listing_id: string;
  listing_title: string;
  role: "buyer" | "seller";
  other_name: string;
  last_body: string;
  last_at: string;
};

const COPY: Record<
  Lang,
  {
    loginPrompt: string;
    loginLink: string;
    title: string;
    subtitle: string;
    empty: string;
    roleBuyer: string;
    roleSeller: string;
    noPreview: string;
  }
> = {
  es: {
    loginPrompt: "Inicia sesión para ver tus mensajes.",
    loginLink: "Entrar",
    title: "Mensajes",
    subtitle: "Conversaciones por anuncio",
    empty: "Aún no tienes mensajes. Abre un anuncio y escribe al vendedor.",
    roleBuyer: "Comprador",
    roleSeller: "Vendedor",
    noPreview: "Sin mensajes",
  },
  en: {
    loginPrompt: "Log in to see your messages.",
    loginLink: "Log in",
    title: "Messages",
    subtitle: "Conversations by listing",
    empty: "You have no messages yet. Open a listing and message the seller.",
    roleBuyer: "Buyer",
    roleSeller: "Seller",
    noPreview: "No messages",
  },
};

function MessagesInboxInner() {
  const lang = useAppLang();
  const t = COPY[lang];
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauth, setUnauth] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/conversations/inbox", { credentials: "same-origin" });
      if (res.status === 401) {
        setUnauth(true);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const data = await res.json();
      setThreads(data.threads ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#FDF8F1] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#1B4332] border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  if (unauth) {
    return (
      <main className="min-h-screen bg-[#FDF8F1] px-4 py-12 text-center">
        <p className="text-[#374151] mb-4">{t.loginPrompt}</p>
        <Link href="/auth/login" className="text-[#1B4332] font-semibold underline">
          {t.loginLink}
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FDF8F1] px-4 py-8">
      <div className="max-w-lg mx-auto">
        <h1 className="font-serif text-2xl font-bold text-[#1C1917] mb-2">{t.title}</h1>
        <p className="text-sm text-[#6B7280] mb-6">{t.subtitle}</p>
        {threads.length === 0 ? (
          <div className="rounded-xl border border-[#E5E0D8] bg-white p-8 text-center text-sm text-[#6B7280]">{t.empty}</div>
        ) : (
          <ul className="space-y-2">
            {threads.map((thread) => (
              <li key={thread.conversationId}>
                <Link
                  href={`/messages/${thread.conversationId}`}
                  className="block rounded-xl border border-[#E5E0D8] bg-white p-4 hover:border-[#1B4332] transition-colors"
                >
                  <div className="flex justify-between gap-2 mb-1">
                    <span className="text-xs font-semibold text-[#1B4332] uppercase tracking-wide">
                      {thread.role === "seller" ? t.roleBuyer : t.roleSeller} · {thread.other_name}
                    </span>
                    <span className="text-[10px] text-[#9CA3AF] shrink-0">
                      {formatDateTimeShort(thread.last_at, lang)}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-[#1C1917] truncate">{thread.listing_title}</p>
                  <p className="text-xs text-[#6B7280] truncate mt-0.5">{thread.last_body || t.noPreview}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

export default function MessagesInboxPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#FDF8F1] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#1B4332] border-t-transparent rounded-full animate-spin" />
        </main>
      }
    >
      <MessagesInboxInner />
    </Suspense>
  );
}
