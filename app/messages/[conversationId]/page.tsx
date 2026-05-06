"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import ConversationThread from "@/components/ConversationThread";
import { useAppLang } from "@/hooks/use-app-lang";
import type { Lang } from "@/lib/i18n-lang";

const BACK: Record<Lang, string> = {
  es: "← Mensajes",
  en: "← Messages",
};

function ConversationPageInner() {
  const params = useParams();
  const conversationId = String(params.conversationId ?? "");
  const lang = useAppLang();
  const [myUserId, setMyUserId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const me = await fetch("/api/auth/me", { credentials: "same-origin" });
      if (me.ok) {
        const j = await me.json();
        setMyUserId(j.user?.id ?? null);
      }
    })();
  }, []);

  if (!conversationId) {
    return null;
  }

  return (
    <main className="min-h-screen bg-[#FDF8F1] px-4 py-8">
      <div className="max-w-lg mx-auto">
        <Link href="/messages" className="text-sm text-[#6B7280] hover:text-[#1B4332] mb-4 inline-block">
          {BACK[lang]}
        </Link>
        <ConversationThread conversationId={conversationId} myUserId={myUserId} lang={lang} />
      </div>
    </main>
  );
}

export default function ConversationPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#FDF8F1] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#1B4332] border-t-transparent rounded-full animate-spin" />
        </main>
      }
    >
      <ConversationPageInner />
    </Suspense>
  );
}
