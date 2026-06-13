"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Lang } from "@/lib/i18n-lang";
import type { ServiceMenu } from "@/lib/listing-service-menu";
import { hasServiceMenu } from "@/lib/listing-service-menu";
import ServiceMenuQuoteBuilder, { type QuoteBuilderPayload } from "@/components/ServiceMenuQuoteBuilder";
import ServiceQuoteBuyerPanel from "@/components/ServiceQuoteBuyerPanel";
import ServiceQuoteSellerRequestPanel from "@/components/ServiceQuoteSellerRequestPanel";
import type { ServiceQuoteLineItem, ServiceQuoteMetadata, ServiceQuoteStatus } from "@/lib/service-quote";

type Msg = { id: string; sender_id: string; body: string; created_at: string };

type Thread = {
  conversationId: string;
  buyer_id: string;
  buyer_name: string;
  last_body: string;
  last_at: string;
};

export default function ListingChat({
  listingId,
  initialConversationId,
  loginReturnTo,
  fullListingHref,
  showFullListingLink,
  lang = "es",
  serviceMenu = null,
  quoteLayout = "default",
  requiresQuoteAccept = false,
  highlightQuote = false,
  highlightRequest = false,
}: {
  listingId: string;
  initialConversationId?: string;
  /** Full path (incl. `?lang=` / `?chat=`) for post-login redirect. */
  loginReturnTo?: string;
  /** Same listing URL without `chat` — “back” to full listing view. */
  fullListingHref?: string;
  showFullListingLink?: boolean;
  lang?: Lang;
  /** Optional service menu for the listing — drives the seller's quote builder. */
  serviceMenu?: ServiceMenu | null;
  /** Housekeeping listings get quick room-type qty picks in the quote builder. */
  quoteLayout?: "default" | "housekeeping";
  /** Housekeeping: gated quote accept before deposit checkout. */
  requiresQuoteAccept?: boolean;
  /** Deep link ?quote=1 — scroll quote panel into view. */
  highlightQuote?: boolean;
  /** Deep link ?request=1 — scroll buyer request breakdown (seller). */
  highlightRequest?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [role, setRole] = useState<"buyer" | "seller" | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Seller: buyer_id for the open thread — stable; do not tie agreed-price fetch to `threads` poll refreshes. */
  const [agreedPriceBuyerId, setAgreedPriceBuyerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  /** Seller: agreed job total in MXN (pesos) for selected buyer — loaded/saved via API (stored as centavos). */
  const [agreedPesos, setAgreedPesos] = useState("");
  const [agreedLoading, setAgreedLoading] = useState(false);
  const [agreedSaving, setAgreedSaving] = useState(false);
  const [agreedErr, setAgreedErr] = useState("");
  const [quoteStatus, setQuoteStatus] = useState<ServiceQuoteStatus>("none");
  const [quoteAgreedCents, setQuoteAgreedCents] = useState<number | null>(null);
  const [quoteSentAt, setQuoteSentAt] = useState<string | null>(null);
  const [quoteLineItems, setQuoteLineItems] = useState<ServiceQuoteLineItem[] | null>(null);
  const [quoteMetadata, setQuoteMetadata] = useState<ServiceQuoteMetadata | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const deepLinkConvLoadedRef = useRef(false);
  /** Scroll this pane — `scrollIntoView` on children scrolls the whole page in Chrome (nested overflow). */
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  /** Which listing `selectedId` belongs to. If it differs from `listingId`, do not use `selectedId` for sends. */
  const conversationListingIdRef = useRef<string | null>(null);
  /** Only full reset (loading + clear threads) when `listingId` actually changes, not on React remount. Stops seller flicker. */
  const lastScopeListingIdRef = useRef<string | null>(null);

  const scrollMessagesToBottom = () => {
    const el = messagesScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    });
  };

  const loadListingScope = useCallback(async () => {
    setError("");
    const listingChanged = lastScopeListingIdRef.current !== listingId;
    if (listingChanged && !initialConversationId) {
      lastScopeListingIdRef.current = listingId;
      // Avoid stale thread/messages from another anuncio (SPA navigation) or a buyer id from another listing
      setLoading(true);
      setSelectedId(null);
      setAgreedPriceBuyerId(null);
      setMessages([]);
      setThreads([]);
      conversationListingIdRef.current = null;
    } else if (listingChanged) {
      lastScopeListingIdRef.current = listingId;
      setLoading(true);
    }

    const res = await fetch(`/api/conversations?listingId=${encodeURIComponent(listingId)}`, {
      credentials: "same-origin",
    });
    if (res.status === 401) {
      setRole(null);
      setLoading(false);
      return;
    }
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError((d as { error?: string }).error ?? "No se pudo cargar el chat");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setRole(data.role);
    if (data.role === "seller") {
      setThreads(data.threads ?? []);
    } else {
      if (data.conversation?.id) {
        setSelectedId(data.conversation.id);
        setMessages(data.messages ?? []);
        conversationListingIdRef.current = listingId;
      }
    }
    setLoading(false);
  }, [listingId, initialConversationId]);

  useEffect(() => {
    deepLinkConvLoadedRef.current = false;
  }, [listingId, initialConversationId]);

  const loadConversation = useCallback(
    async (conversationId: string, buyerIdHint?: string | null) => {
      setSelectedId(conversationId);
      setError("");
      if (buyerIdHint != null && String(buyerIdHint).trim() !== "") {
        setAgreedPriceBuyerId(String(buyerIdHint));
      } else {
        setAgreedPriceBuyerId(null);
      }
      try {
        const res = await fetch(`/api/conversations/${conversationId}`, { credentials: "same-origin" });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setError((d as { error?: string }).error ?? "No se pudo cargar");
          setSelectedId(null);
          setAgreedPriceBuyerId(null);
          conversationListingIdRef.current = null;
          return;
        }
        const data = await res.json();
        setMessages(data.messages ?? []);
        const conv = data.conversation as { listing_id?: string; buyer_id?: string } | undefined;
        const bid = conv?.buyer_id;
        if (bid) setAgreedPriceBuyerId(String(bid));
        const apiListingId = conv?.listing_id?.trim().toLowerCase() ?? "";
        if (apiListingId && apiListingId === listingId.trim().toLowerCase()) {
          conversationListingIdRef.current = listingId;
        } else {
          conversationListingIdRef.current = null;
        }
      } catch {
        setError("Error de conexión");
        setSelectedId(null);
        setAgreedPriceBuyerId(null);
        conversationListingIdRef.current = null;
      }
    },
    [listingId]
  );

  useEffect(() => {
    void (async () => {
      const me = await fetch("/api/auth/me", { credentials: "same-origin" });
      if (me.ok) {
        const j = await me.json();
        setMyUserId(j.user?.id ?? null);
      }
      await loadListingScope();
    })();
  }, [listingId, loadListingScope]);

  useEffect(() => {
    const onBookingPaid = (ev: Event) => {
      const d = (ev as CustomEvent<{ listingId?: string }>).detail;
      if (!d?.listingId || d.listingId === listingId) {
        void loadListingScope();
        if (selectedId) void loadConversation(selectedId);
      }
    };
    window.addEventListener("tianguis:booking-paid", onBookingPaid);
    return () => window.removeEventListener("tianguis:booking-paid", onBookingPaid);
  }, [listingId, loadListingScope, loadConversation, selectedId]);

  useEffect(() => {
    const onLifecycle = (ev: Event) => {
      const d = (ev as CustomEvent<{ listingId?: string }>).detail;
      if (
        d?.listingId &&
        d.listingId.trim().toLowerCase() === listingId.trim().toLowerCase()
      ) {
        void loadListingScope();
        if (selectedId) void loadConversation(selectedId);
      }
    };
    window.addEventListener("tianguis:booking-lifecycle", onLifecycle);
    return () => window.removeEventListener("tianguis:booking-lifecycle", onLifecycle);
  }, [listingId, loadListingScope, loadConversation, selectedId]);

  useEffect(() => {
    if (loading || !initialConversationId || deepLinkConvLoadedRef.current) return;
    if (role === "seller") {
      const th = threads.find((t) => t.conversationId === initialConversationId);
      if (!th && threads.length === 0) return;
      deepLinkConvLoadedRef.current = true;
      void loadConversation(initialConversationId, th?.buyer_id);
      return;
    }
    if (role === "buyer") {
      deepLinkConvLoadedRef.current = true;
      void loadConversation(initialConversationId);
    }
  }, [loading, initialConversationId, role, threads, loadConversation]);

  // Sellers otherwise see an empty message pane until they click a buyer; they may think no message arrived.
  useEffect(() => {
    if (role !== "seller" || threads.length === 0) return;
    if (selectedId) return;
    if (initialConversationId) return;
    void loadConversation(threads[0].conversationId, threads[0].buyer_id);
  }, [role, threads, selectedId, initialConversationId, loadConversation]);

  useEffect(() => {
    scrollMessagesToBottom();
  }, [messages]);

  // Poll selected conversation for new messages
  useEffect(() => {
    if (!selectedId) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/conversations/${selectedId}`, { credentials: "same-origin" });
        if (!res.ok) return;
        const data = await res.json();
        const fresh: Msg[] = data.messages ?? [];
        if (fresh.length === 0) return;
        setMessages((prev) => {
          const lastFresh = fresh[fresh.length - 1]?.id;
          const lastPrev = prev[prev.length - 1]?.id;
          if (lastFresh !== lastPrev || fresh.length !== prev.length) return fresh;
          return prev;
        });
      } catch { /* silent */ }
    }, 5000);
    return () => clearInterval(poll);
  }, [selectedId]);

  // Buyers: re-fetch listing-scoped thread periodically so seller replies appear even if /conversations/[id] lags.
  useEffect(() => {
    if (role !== "buyer" || !listingId) return;
    const poll = setInterval(() => {
      void loadListingScope();
    }, 7500);
    return () => clearInterval(poll);
  }, [role, listingId, loadListingScope]);

  useEffect(() => {
    if (role !== "seller") {
      setAgreedPesos("");
      setAgreedErr("");
      setAgreedLoading(false);
      setAgreedPriceBuyerId(null);
      return;
    }
    if (!agreedPriceBuyerId) {
      setAgreedLoading(false);
      return;
    }
    let cancelled = false;
    setAgreedLoading(true);
    setAgreedErr("");
    void (async () => {
      try {
        const r = await fetch(
          `/api/listings/${encodeURIComponent(listingId)}/service-booking/agreed-price?buyerId=${encodeURIComponent(agreedPriceBuyerId)}`,
          { credentials: "same-origin" }
        );
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          if (!cancelled) {
            setAgreedErr((d as { error?: string }).error ?? "No se pudo cargar precio acordado");
            setAgreedPesos("");
          }
          return;
        }
        const cents = (d as { agreedSubtotalMxnCents?: number | null }).agreedSubtotalMxnCents;
        if (!cancelled) {
          setAgreedPesos(cents != null && Number.isFinite(Number(cents)) ? String(Number(cents) / 100) : "");
        }
      } catch {
        if (!cancelled) setAgreedErr("Error de red");
      } finally {
        if (!cancelled) setAgreedLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role, listingId, agreedPriceBuyerId]);

  const loadQuoteState = useCallback(async () => {
    if (!requiresQuoteAccept) return;
    setQuoteLoading(true);
    try {
      const buyerQuery =
        role === "seller" && agreedPriceBuyerId
          ? `?buyerId=${encodeURIComponent(agreedPriceBuyerId)}`
          : "";
      const r = await fetch(
        `/api/listings/${encodeURIComponent(listingId)}/service-booking/quote${buyerQuery}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return;
      setQuoteStatus((d as { quoteStatus?: ServiceQuoteStatus }).quoteStatus ?? "none");
      const cents = (d as { agreedSubtotalMxnCents?: number | null }).agreedSubtotalMxnCents;
      setQuoteAgreedCents(cents != null ? Number(cents) : null);
      setQuoteSentAt((d as { quoteSentAt?: string | null }).quoteSentAt ?? null);
      const items = (d as { quoteLineItems?: ServiceQuoteLineItem[] | null }).quoteLineItems;
      setQuoteLineItems(Array.isArray(items) && items.length > 0 ? items : null);
      setQuoteMetadata((d as { quoteMetadata?: ServiceQuoteMetadata | null }).quoteMetadata ?? null);
    } finally {
      setQuoteLoading(false);
    }
  }, [requiresQuoteAccept, role, agreedPriceBuyerId, listingId]);

  useEffect(() => {
    void loadQuoteState();
  }, [loadQuoteState]);

  useEffect(() => {
    const onQuote = (ev: Event) => {
      const d = (ev as CustomEvent<{ listingId?: string }>).detail;
      if (d?.listingId && d.listingId !== listingId) return;
      void loadQuoteState();
    };
    window.addEventListener("tianguis:quote-updated", onQuote);
    window.addEventListener("tianguis:agreed-price-updated", onQuote);
    return () => {
      window.removeEventListener("tianguis:quote-updated", onQuote);
      window.removeEventListener("tianguis:agreed-price-updated", onQuote);
    };
  }, [listingId, loadQuoteState]);

  useEffect(() => {
    if (!highlightQuote) return;
    const t = window.setTimeout(() => {
      document.getElementById("service-quote-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 400);
    return () => window.clearTimeout(t);
  }, [highlightQuote, quoteStatus]);

  useEffect(() => {
    if (!highlightRequest) return;
    const t = window.setTimeout(() => {
      document.getElementById("seller-request-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 600);
    return () => window.clearTimeout(t);
  }, [highlightRequest, quoteLineItems]);

  const sendOfficialQuote = async (payload: QuoteBuilderPayload) => {
    if (role !== "seller" || !agreedPriceBuyerId) return;
    setAgreedErr("");
    const r = await fetch(`/api/listings/${encodeURIComponent(listingId)}/service-booking/quote/send`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyerId: agreedPriceBuyerId,
        agreedSubtotalMxnCents: payload.totalCents,
        quoteLineItems: payload.lineItems,
        quoteMetadata: {
          visitFrequency: payload.visitFrequency,
          quoteBasis: payload.quoteBasis,
          lang: lang === "en" ? "en" : "es",
          kind: "provider_quote",
        },
        messageBody: payload.messageBody,
        lang: lang === "en" ? "en" : "es",
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((d as { error?: string; message?: string }).message ?? (d as { error?: string }).error ?? "No se pudo enviar cotización");
    setAgreedPesos(String(payload.totalCents / 100));
    const connectWarning = (d as { connectWarning?: string | null }).connectWarning;
    if (connectWarning) {
      setAgreedErr(connectWarning);
    }
    const msg = (d as { message?: Msg }).message;
    if (msg) setMessages((m) => [...m, msg]);
    window.dispatchEvent(new CustomEvent("tianguis:quote-updated", { detail: { listingId } }));
    window.dispatchEvent(new CustomEvent("tianguis:agreed-price-updated", { detail: { listingId } }));
    await loadQuoteState();
  };

  const submitCleaningRequest = async (payload: QuoteBuilderPayload) => {
    if (role !== "buyer") return;
    setError("");
    const r = await fetch(`/api/listings/${encodeURIComponent(listingId)}/service-booking/quote/request`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cartLines: payload.cartLines,
        visitFrequency: payload.visitFrequency,
        quoteBasis: payload.quoteBasis,
        buyerNotes: payload.buyerNotes,
        lang: lang === "en" ? "en" : "es",
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((d as { error?: string }).error ?? "No se pudo enviar solicitud");
    const msg = (d as { message?: Msg }).message;
    const convId = (d as { conversationId?: string }).conversationId;
    if (convId) {
      setSelectedId(convId);
      conversationListingIdRef.current = listingId;
    }
    if (msg) setMessages((m) => [...m, msg]);
    window.dispatchEvent(new CustomEvent("tianguis:listing-contact"));
    window.dispatchEvent(new CustomEvent("tianguis:quote-updated", { detail: { listingId } }));
  };

  // Poll thread list for new buyers/messages (seller only)
  useEffect(() => {
    if (role !== "seller") return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/conversations?listingId=${encodeURIComponent(listingId)}`, { credentials: "same-origin" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.role === "seller" && Array.isArray(data.threads)) {
          setThreads(data.threads);
        }
      } catch { /* silent */ }
    }, 4000);
    return () => clearInterval(poll);
  }, [role, listingId]);

  /** Always resolves the thread for this `listingId` (idempotent). Do not short-circuit on selectedId — it may belong to another anuncio. */
  const ensureConversation = async (): Promise<string | null> => {
    const res = await fetch("/api/conversations", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error((d as { error?: string }).error ?? "No se pudo iniciar el chat");
    }
    const { conversationId } = await res.json();
    return conversationId as string;
  };

  const postMessageBody = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    setError("");
    try {
      let cid: string | null = role === "buyer" ? null : selectedId;
      if (role === "buyer") {
        if (conversationListingIdRef.current === listingId && selectedId) {
          cid = selectedId;
        } else {
          cid = await ensureConversation();
          if (!cid) throw new Error("Sin conversación");
          conversationListingIdRef.current = listingId;
          setSelectedId(cid);
        }
      }
      if (!cid) throw new Error("Selecciona una conversación");
      const res = await fetch(`/api/conversations/${cid}/messages`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? "No se pudo enviar");
      }
      const { message } = await res.json();
      setMessages((m) => [...m, message as Msg]);
      if (typeof window !== "undefined" && role !== "seller") {
        window.dispatchEvent(new CustomEvent("tianguis:listing-contact"));
      }
    } finally {
      setSending(false);
    }
  };

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    try {
      await postMessageBody(text);
      setDraft("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    }
  };

  const saveAgreedPrice = async (clear: boolean) => {
    if (role !== "seller" || !agreedPriceBuyerId) return;
    setAgreedSaving(true);
    setAgreedErr("");
    try {
      const pesos = parseFloat(String(agreedPesos).trim().replace(/,/g, "."));
      const cents = Math.round(pesos * 100);
      const body = clear
        ? { buyerId: agreedPriceBuyerId, agreedSubtotalMxnCents: null as number | null }
        : { buyerId: agreedPriceBuyerId, agreedSubtotalMxnCents: cents };
      if (!clear) {
        if (!Number.isFinite(pesos) || cents < 100) {
          throw new Error(lang === "en" ? "Enter a valid amount (at least $1 MXN)." : "Monto inválido (mín. $1 MXN).");
        }
      }
      const r = await fetch(`/api/listings/${encodeURIComponent(listingId)}/service-booking/agreed-price`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? "No se pudo guardar");
      if (clear) setAgreedPesos("");
      window.dispatchEvent(new CustomEvent("tianguis:agreed-price-updated", { detail: { listingId } }));
    } catch (e: unknown) {
      setAgreedErr(e instanceof Error ? e.message : "Error");
    } finally {
      setAgreedSaving(false);
    }
  };

  if (loading) {
    return (
      <div
        id="listing-inapp-chat"
        className="rounded-xl border border-[#E5E0D8] bg-white p-4 text-center text-sm text-[#6B7280]"
      >
        Cargando mensajes…
      </div>
    );
  }

  if (!role) {
    return (
      <div id="listing-inapp-chat" className="rounded-xl border border-[#E5E0D8] bg-[#F4F0EB] p-4 text-center">
        <p className="text-sm text-[#374151] mb-3">Inicia sesión para escribir al vendedor dentro de la app.</p>
        <Link
          href={`/auth/login?returnTo=${encodeURIComponent(loginReturnTo ?? `/listing/${listingId}`)}`}
          className="inline-block px-4 py-2 rounded-xl bg-[#1B4332] text-white text-sm font-semibold"
        >
          Entrar
        </Link>
      </div>
    );
  }

  return (
    <div id="listing-inapp-chat" className="rounded-xl border border-[#E5E0D8] bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-[#E5E0D8] bg-[#F4F0EB] flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-[#1C1917]">Mensajes en la app</h3>
          <p className="text-xs text-[#6B7280] mt-0.5">El vendedor verá tus mensajes aquí y en “Mensajes”.</p>
        </div>
        {showFullListingLink && fullListingHref ? (
          <Link
            href={`${fullListingHref}#listing-top`}
            className="text-xs font-semibold text-[#1B4332] hover:underline shrink-0"
          >
            {lang === "en" ? "View listing page" : "Ver ficha del anuncio"}
          </Link>
        ) : null}
      </div>

      {role === "seller" && threads.length > 0 && (
        <div className="border-b border-[#E5E0D8]">
          <p className="px-4 pt-2 pb-1 text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
            Compradores ({threads.length})
          </p>
          <div className="max-h-36 overflow-y-auto divide-y divide-[#E5E0D8]">
            {threads.map((t) => {
              const isActive = selectedId === t.conversationId;
              return (
                <button
                  key={t.conversationId}
                  type="button"
                  onClick={() => void loadConversation(t.conversationId, t.buyer_id)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-3 ${
                    isActive ? "bg-[#ECFDF5] border-l-4 border-[#059669]" : "hover:bg-[#F4F0EB] border-l-4 border-transparent"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    isActive ? "bg-[#059669] text-white" : "bg-[#F4F0EB] text-[#1B4332]"
                  }`}>
                    {(t.buyer_name?.[0] ?? "C").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={`font-semibold ${isActive ? "text-[#065F46]" : "text-[#1C1917]"}`}>
                      {t.buyer_name}
                    </span>
                    <span className="block text-xs text-[#6B7280] truncate">{t.last_body || "Sin mensajes aún"}</span>
                  </div>
                  {isActive && <span className="text-[#059669] text-xs">●</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {role === "seller" && threads.length === 0 && (
        <p className="px-4 py-3 text-sm text-[#6B7280]">Aún no hay mensajes de compradores en este anuncio.</p>
      )}

      {/* Active chat header — shows who you're talking to */}
      {role === "seller" && selectedId && (() => {
        const active = threads.find((t) => t.conversationId === selectedId);
        return active ? (
          <div className="px-4 py-2 bg-[#ECFDF5] border-b border-[#A7F3D0] flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#1B4332] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {(active.buyer_name?.[0] ?? "C").toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[#065F46]">Chateando con: {active.buyer_name}</p>
            </div>
            <span className="text-[10px] text-[#059669] font-semibold px-2 py-0.5 rounded-full bg-[#D1FAE5]">Activo</span>
          </div>
        ) : null;
      })()}

      {role === "seller" && selectedId && (
        <div className="px-4 py-2 border-b border-[#E5E0D8] bg-[#FFFBEB] text-xs space-y-2">
          <p className="font-semibold text-[#78350F]">
            {lang === "en" ? "Agreed job total (this buyer)" : "Precio acordado del trabajo (este comprador)"}
          </p>
          <p className="text-[#92400E] leading-snug">
            {lang === "en"
              ? "Optional: total for this job in MXN (same base as listing/package unless you set this). Buyer pays the platform fee on this amount, or can pay the full service in-app if you have Stripe payouts."
              : "Opcional: total del trabajo en MXN (si no lo pones, se usa el precio del anuncio o paquete). El comprador paga la tarifa de Naranjogo sobre este monto, o puede pagar el servicio completo en la app si activaste cobros con Stripe."}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex-1 min-w-[120px]">
              <span className="sr-only">MXN</span>
              <input
                type="text"
                inputMode="decimal"
                value={agreedPesos}
                onChange={(e) => setAgreedPesos(e.target.value)}
                disabled={!agreedPriceBuyerId || agreedSaving}
                placeholder={lang === "en" ? "e.g. 850" : "ej. 850"}
                className="w-full rounded-lg border border-amber-200 px-2 py-1.5 text-sm text-[#1C1917] outline-none focus:border-[#B45309]"
              />
            </label>
            <button
              type="button"
              disabled={!agreedPriceBuyerId || agreedLoading || agreedSaving}
              onClick={() => void saveAgreedPrice(false)}
              className="px-3 py-1.5 rounded-lg bg-[#B45309] text-white text-[11px] font-semibold disabled:opacity-40"
            >
              {agreedSaving ? "…" : lang === "en" ? "Save" : "Guardar"}
            </button>
            <button
              type="button"
              disabled={!agreedPriceBuyerId || agreedLoading || agreedSaving}
              onClick={() => void saveAgreedPrice(true)}
              className="px-3 py-1.5 rounded-lg border border-amber-300 text-[#78350F] text-[11px] font-semibold disabled:opacity-40"
            >
              {lang === "en" ? "Clear" : "Quitar"}
            </button>
          </div>
          {agreedLoading ? (
            <p className="text-[#A16207]">{lang === "en" ? "Loading agreed total…" : "Cargando precio acordado…"}</p>
          ) : !agreedPriceBuyerId && selectedId ? (
            <p className="text-[#A16207]">{lang === "en" ? "Loading thread…" : "Cargando conversación…"}</p>
          ) : null}
          {agreedErr ? <p className="text-red-600">{agreedErr}</p> : null}
          {requiresQuoteAccept &&
            quoteStatus === "none" &&
            quoteLineItems != null &&
            quoteLineItems.length > 0 &&
            hasServiceMenu(serviceMenu) && (
              <ServiceQuoteSellerRequestPanel
                lineItems={quoteLineItems}
                metadata={quoteMetadata}
                menu={serviceMenu}
                lang={lang === "en" ? "en" : "es"}
              />
            )}
          {hasServiceMenu(serviceMenu) && agreedPriceBuyerId && (
            <ServiceMenuQuoteBuilder
              menu={serviceMenu}
              lang={lang === "en" ? "en" : "es"}
              quoteLayout={quoteLayout}
              variant="seller"
              disabled={agreedSaving || agreedLoading}
              initialCartLines={quoteLineItems?.map((x) => ({ sku: x.sku, qty: x.qty }))}
              initialVisitFrequency={quoteMetadata?.visitFrequency}
              initialQuoteBasis={quoteMetadata?.quoteBasis}
              onApplyTotal={(pesos) => setAgreedPesos(pesos)}
              onSendOfficialQuote={requiresQuoteAccept ? sendOfficialQuote : undefined}
              onInsertAsMessage={async (body) => {
                try {
                  await postMessageBody(body);
                } catch (e: unknown) {
                  setAgreedErr(e instanceof Error ? e.message : "Error");
                }
              }}
            />
          )}
        </div>
      )}

      {role === "buyer" && requiresQuoteAccept && hasServiceMenu(serviceMenu) && quoteStatus === "none" && (quoteLineItems?.length ?? 0) > 0 && (
        <div className="px-4 py-2 border-b border-[#E5E0D8] bg-blue-50 text-xs text-blue-900">
          {lang === "en"
            ? "✓ Request sent — waiting for your provider’s official quote. You’ll get Accept / Decline buttons here when they send it."
            : "✓ Solicitud enviada — esperando la cotización oficial del proveedor. Verás Aceptar / Rechazar aquí cuando la envíe."}
        </div>
      )}

      {role === "buyer" &&
        requiresQuoteAccept &&
        hasServiceMenu(serviceMenu) &&
        (quoteStatus === "none" || quoteStatus === "declined") &&
        !(quoteStatus === "none" && (quoteLineItems?.length ?? 0) > 0) && (
        <div className="px-4 py-2 border-b border-[#E5E0D8] bg-[#FFFBEB]">
          <ServiceMenuQuoteBuilder
            menu={serviceMenu}
            lang={lang === "en" ? "en" : "es"}
            quoteLayout={quoteLayout}
            variant="buyer"
            disabled={sending || quoteLoading}
            onSubmitRequest={submitCleaningRequest}
          />
        </div>
      )}

      {role === "buyer" && requiresQuoteAccept && !quoteLoading && quoteStatus !== "none" && (
        <div className="px-4 py-2 border-b border-[#E5E0D8]">
          <ServiceQuoteBuyerPanel
            listingId={listingId}
            quoteStatus={quoteStatus}
            agreedSubtotalMxnCents={quoteAgreedCents}
            quoteSentAt={quoteSentAt}
            lang={lang === "en" ? "en" : "es"}
            disabled={sending}
            onResponded={() => {
              void loadQuoteState();
              const el = document.getElementById("booking-section");
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          />
        </div>
      )}

      {role === "seller" && requiresQuoteAccept && agreedPriceBuyerId && !quoteLoading && quoteStatus !== "none" && (
        <div className="px-4 py-2 border-b border-[#E5E0D8] text-xs">
          <p className="font-semibold text-[#78350F]">
            {lang === "en" ? "Quote status" : "Estado de cotización"}:{" "}
            <span className="text-[#92400E]">
              {quoteStatus === "pending"
                ? lang === "en"
                  ? "Waiting for customer"
                  : "Esperando al cliente"
                : quoteStatus === "accepted"
                  ? lang === "en"
                    ? "Accepted — customer can pay deposit"
                    : "Aceptada — cliente puede pagar depósito"
                  : lang === "en"
                    ? "Declined"
                    : "Rechazada"}
            </span>
          </p>
          {quoteAgreedCents != null && quoteAgreedCents > 0 ? (
            <p className="text-[#92400E] mt-1">
              {lang === "en" ? "Total" : "Total"}:{" "}
              {new Intl.NumberFormat(lang === "en" ? "en-MX" : "es-MX", {
                style: "currency",
                currency: "MXN",
                maximumFractionDigits: 0,
              }).format(quoteAgreedCents / 100)}
            </p>
          ) : null}
          {quoteStatus === "declined" ? (
            <p className="text-[#B45309] mt-2 leading-snug">
              {lang === "en"
                ? "Customer declined — adjust rooms or price in the quote builder below, then tap Send official quote again."
                : "El cliente rechazó — ajusta habitaciones o precio abajo y vuelve a pulsar «Enviar cotización al cliente»."}
            </p>
          ) : null}
        </div>
      )}

      <div
        ref={messagesScrollRef}
        className="max-h-64 overflow-y-auto overflow-x-hidden px-4 py-3 space-y-2 overscroll-y-contain"
      >
        {messages.map((m) => {
          const mine = myUserId && m.sender_id === myUserId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                  mine ? "bg-[#1B4332] text-white" : "bg-[#F4F0EB] text-[#1C1917]"
                }`}
              >
                {m.body}
              </div>
            </div>
          );
        })}
      </div>

      {error && <div className="px-4 pb-2 text-xs text-red-600">{error}</div>}

      <div className="p-3 border-t border-[#E5E0D8] flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), void sendMessage())}
          placeholder={role === "seller" && !selectedId ? "Elige un comprador arriba…" : "Escribe un mensaje…"}
          disabled={(role === "seller" && !selectedId) || sending}
          className="flex-1 rounded-xl border border-[#E5E0D8] px-3 py-2 text-sm outline-none focus:border-[#1B4332]"
        />
        <button
          type="button"
          disabled={(role === "seller" && !selectedId) || sending || !draft.trim()}
          onClick={() => void sendMessage()}
          className="px-4 py-2 rounded-xl bg-[#1B4332] text-white text-sm font-semibold disabled:opacity-40"
        >
          {sending ? "…" : "Enviar"}
        </button>
      </div>

      <div className="px-3 pb-3 text-center">
        <Link href="/messages" className="text-xs text-[#1B4332] font-semibold hover:underline">
          Ver todos los mensajes
        </Link>
      </div>
    </div>
  );
}
