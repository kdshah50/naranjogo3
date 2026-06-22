"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Lang } from "@/lib/i18n-lang";
import type { ServiceMenu } from "@/lib/listing-service-menu";
import { hasServiceMenu, effectiveServiceMenuForListing } from "@/lib/listing-service-menu";
import ServiceMenuQuoteBuilder, { type QuoteBuilderPayload } from "@/components/ServiceMenuQuoteBuilder";
import type { BuyerQuoteContact } from "@/lib/buyer-quote-contact";
import { buyerContactPrefillFromMetadata } from "@/lib/buyer-quote-contact";
import ServiceQuoteBuyerPanel from "@/components/ServiceQuoteBuyerPanel";
import ServiceQuoteSellerRequestPanel from "@/components/ServiceQuoteSellerRequestPanel";
import {
  buyerFacingQuoteStatus,
  type ServiceQuoteLineItem,
  type ServiceQuoteMetadata,
  type ServiceQuoteStatus,
} from "@/lib/service-quote";
import {
  applyChatPollUpdate,
  appendChatMessageDeduped,
  normalizeConversationId,
  threadActivitySig,
  type ChatPollMessage,
} from "@/lib/listing-chat-poll";
import { listingChatCopy, formatListingChatSystemBody } from "@/lib/listing-chat-copy";
import { withLang } from "@/lib/i18n-lang";
import {
  conversationDayKey,
  formatConversationDayLabel,
  formatDateTimeShort,
} from "@/lib/locale-format";

type Msg = ChatPollMessage;

type Thread = {
  conversationId: string;
  buyer_id: string;
  buyer_name: string;
  last_body: string;
  last_at: string;
  ticket_code?: string | null;
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
  providerSlug = null,
  requiresQuoteAccept = false,
  highlightQuote = false,
  highlightRequest = false,
  highlightRebook = false,
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
  providerSlug?: string | null;
  /** Gated quote accept before deposit checkout. */
  requiresQuoteAccept?: boolean;
  /** Deep link ?quote=1 — scroll quote panel into view. */
  highlightQuote?: boolean;
  /** Deep link ?request=1 — scroll buyer request breakdown (seller). */
  highlightRequest?: boolean;
  /** Deep link ?rebook=1 — reset gate and show buyer request form with prefill. */
  highlightRebook?: boolean;
}) {
  const c = listingChatCopy(lang);
  const [loading, setLoading] = useState(() => !initialConversationId?.trim());
  const [scopeLoaded, setScopeLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [role, setRole] = useState<"buyer" | "seller" | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsTotal, setThreadsTotal] = useState(0);
  const [buyerTicketCode, setBuyerTicketCode] = useState<string | null>(null);
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
  const [rebookPreparing, setRebookPreparing] = useState(false);
  const [rebookPrepareError, setRebookPrepareError] = useState("");
  const [buyerContactPrefill, setBuyerContactPrefill] = useState<Partial<BuyerQuoteContact> | undefined>();
  const deepLinkConvLoadedRef = useRef(false);
  /** Scroll this pane — `scrollIntoView` on children scrolls the whole page in Chrome (nested overflow). */
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  /** Which listing `selectedId` belongs to. If it differs from `listingId`, do not use `selectedId` for sends. */
  const conversationListingIdRef = useRef<string | null>(null);
  /** Only full reset (loading + clear threads) when `listingId` actually changes, not on React remount. Stops seller flicker. */
  const lastScopeListingIdRef = useRef<string | null>(null);
  /** Seller: detect thread activity changes to reload open conversation. */
  const lastThreadActivityRef = useRef<string | null>(null);
  const rebookPrepareRanRef = useRef(false);
  const activeConversationIdRef = useRef<string | null>(null);
  const conversationLoadSeqRef = useRef(0);
  const selectedIdRef = useRef<string | null>(null);
  const initialConversationIdRef = useRef(initialConversationId?.trim() || null);
  /** Seller manually picked a thread — don't let ?chat= deep-link polls override it. */
  const userPickedThreadRef = useRef(false);
  const emptyThreadBootstrapRef = useRef<string | null>(null);
  const [myAccountPool, setMyAccountPool] = useState<string[]>([]);

  useEffect(() => {
    initialConversationIdRef.current = initialConversationId?.trim() || null;
  }, [initialConversationId]);

  // Deep link: bind thread id immediately so polls start before listing scope returns.
  useEffect(() => {
    const cid = initialConversationId?.trim();
    if (!cid) return;
    setSelectedId(cid);
    selectedIdRef.current = cid;
    activeConversationIdRef.current = normalizeConversationId(cid);
  }, [initialConversationId]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
    if (selectedId) {
      activeConversationIdRef.current = normalizeConversationId(selectedId);
    }
  }, [selectedId]);

  useEffect(() => {
    rebookPrepareRanRef.current = false;
    setRebookPrepareError("");
  }, [listingId]);

  const effectiveMenu = useMemo(
    () => effectiveServiceMenuForListing(serviceMenu, providerSlug),
    [serviceMenu, providerSlug],
  );

  const scrollMessagesToBottom = () => {
    const el = messagesScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    });
  };

  const loadListingScope = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    setError("");
    const listingChanged = lastScopeListingIdRef.current !== listingId;
    const deepLinked = Boolean(initialConversationId?.trim());

    if (listingChanged) {
      lastScopeListingIdRef.current = listingId;
      if (!silent && !deepLinked) {
        setLoading(true);
        setSelectedId(null);
        setAgreedPriceBuyerId(null);
        setMessages([]);
        setThreads([]);
        conversationListingIdRef.current = null;
      } else if (!silent && deepLinked) {
        setLoading(false);
      }
    }

    try {
      const scopeQuery = deepLinked
        ? `listingId=${encodeURIComponent(listingId)}&conversationId=${encodeURIComponent(initialConversationId!.trim())}`
        : `listingId=${encodeURIComponent(listingId)}`;
      const res = await fetch(`/api/conversations?${scopeQuery}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (res.status === 401) {
        setRole(null);
        setScopeLoaded(true);
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError((d as { error?: string }).error ?? c.loadChatErr);
        return;
      }
      const data = await res.json();
      setRole(data.role);
      if (data.role === "seller") {
        setThreads(data.threads ?? []);
        setThreadsTotal(Number(data.threadsTotal ?? data.threads?.length ?? 0));
        const focus = data.focusConversation as
          | { id?: string; buyer_id?: string; messages?: Msg[] }
          | null
          | undefined;
        if (focus?.id) {
          const focusNorm = normalizeConversationId(String(focus.id));
          const keepUserPick =
            userPickedThreadRef.current &&
            selectedIdRef.current &&
            normalizeConversationId(selectedIdRef.current) !== focusNorm;
          if (!keepUserPick) {
            setSelectedId(String(focus.id));
            if (focus.buyer_id) setAgreedPriceBuyerId(String(focus.buyer_id));
          }
          const fresh = (focus.messages ?? []) as Msg[];
          if (fresh.length > 0) {
            setMessages((prev) => applyChatPollUpdate(prev, fresh));
          }
          conversationListingIdRef.current = listingId;
        }
      } else {
        setBuyerTicketCode((data.ticket_code as string | null | undefined) ?? null);
        if (data.conversation?.id) {
          setSelectedId(data.conversation.id);
          const fresh: Msg[] = data.messages ?? [];
          setMessages((prev) => applyChatPollUpdate(prev, fresh));
          conversationListingIdRef.current = listingId;
        }
      }
    } catch {
      if (!silent) setError(c.networkErr);
    } finally {
      setScopeLoaded(true);
      if (!silent) setLoading(false);
    }
  }, [listingId, initialConversationId, c.loadChatErr, c.networkErr]);

  useEffect(() => {
    deepLinkConvLoadedRef.current = false;
    setScopeLoaded(false);
  }, [listingId, initialConversationId]);

  const loadConversation = useCallback(
    async (conversationId: string, buyerIdHint?: string | null) => {
      const normId = normalizeConversationId(conversationId);
      const switching =
        activeConversationIdRef.current != null && activeConversationIdRef.current !== normId;
      const seq = ++conversationLoadSeqRef.current;
      activeConversationIdRef.current = normId;
      setSelectedId(conversationId);
      setError("");
      if (switching) setMessages([]);

      if (buyerIdHint != null && String(buyerIdHint).trim() !== "") {
        setAgreedPriceBuyerId(String(buyerIdHint));
      }

      try {
        const res = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) {
          if (seq !== conversationLoadSeqRef.current) return;
          const d = await res.json().catch(() => ({}));
          setError((d as { error?: string }).error ?? c.loadErr);
          const deepId = initialConversationIdRef.current;
          const keepDeepLink =
            deepId && normalizeConversationId(deepId) === normId;
          if (!keepDeepLink) {
            setSelectedId(null);
            setAgreedPriceBuyerId(null);
            conversationListingIdRef.current = null;
            activeConversationIdRef.current = null;
          }
          return;
        }
        const data = await res.json();
        if (seq !== conversationLoadSeqRef.current) return;
        const fresh = (data.messages ?? []) as Msg[];
        setMessages((prev) => (switching ? fresh : applyChatPollUpdate(prev, fresh)));
        const conv = data.conversation as { listing_id?: string; buyer_id?: string } | undefined;
        const bid = conv?.buyer_id;
        if (bid) setAgreedPriceBuyerId(String(bid));
        const apiListingId = conv?.listing_id?.trim().toLowerCase() ?? "";
        const pageListingId = listingId.trim().toLowerCase();
        if (!apiListingId || apiListingId === pageListingId) {
          conversationListingIdRef.current = listingId;
        } else {
          conversationListingIdRef.current = null;
        }
        const loadedMsgs = (data.messages ?? []) as Msg[];
        const lastMsg = loadedMsgs[loadedMsgs.length - 1];
        if (lastMsg) {
          lastThreadActivityRef.current = threadActivitySig(lastMsg.created_at, lastMsg.body);
        }
      } catch {
        if (seq !== conversationLoadSeqRef.current) return;
        setError(c.networkErr);
        const deepId = initialConversationIdRef.current;
        const keepDeepLink = deepId && normalizeConversationId(deepId) === normId;
        if (!keepDeepLink) {
          setSelectedId(null);
          setAgreedPriceBuyerId(null);
          conversationListingIdRef.current = null;
          activeConversationIdRef.current = null;
        }
      }
    },
    [listingId, c.loadErr, c.networkErr],
  );

  /** Lightweight message sync — avoids clearing seller state on thread activity bumps. */
  const syncConversationMessages = useCallback(async (conversationId: string) => {
    const normId = normalizeConversationId(conversationId);
    const selectedNorm = selectedIdRef.current
      ? normalizeConversationId(selectedIdRef.current)
      : null;
    if (selectedNorm !== normId) return;
    try {
      const res = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (selectedIdRef.current && normalizeConversationId(selectedIdRef.current) !== normId) return;
      const fresh = (data.messages ?? []) as Msg[];
      setMessages((prev) => applyChatPollUpdate(prev, fresh));
      const lastMsg = fresh[fresh.length - 1];
      if (lastMsg) {
        lastThreadActivityRef.current = threadActivitySig(lastMsg.created_at, lastMsg.body);
      }
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const me = await fetch("/api/auth/me", { credentials: "same-origin" });
      if (me.ok) {
        const j = await me.json();
        setMyUserId(j.user?.id ?? null);
        const pool = (j as { accountPool?: string[] }).accountPool;
        if (Array.isArray(pool) && pool.length > 0) {
          setMyAccountPool(pool.map((id) => String(id).trim().toLowerCase()));
        }
        const u = j.user as { display_name?: string | null; phone?: string | null } | undefined;
        if (u?.display_name || u?.phone) {
          const parts = String(u.display_name ?? "").trim().split(/\s+/).filter(Boolean);
          const digits = String(u.phone ?? "").trim();
          setBuyerContactPrefill({
            firstName: parts[0] ?? "",
            lastName: parts.slice(1).join(" "),
            contactPhone: digits ? (digits.startsWith("+") ? digits : `+${digits}`) : "",
          });
        }
      }
      await loadListingScope();
    })();
  }, [listingId, loadListingScope]);

  useEffect(() => {
    const onBookingPaid = (ev: Event) => {
      const d = (ev as CustomEvent<{ listingId?: string }>).detail;
      if (!d?.listingId || d.listingId === listingId) {
        void loadListingScope({ silent: true });
        if (selectedId) void loadConversation(selectedId, agreedPriceBuyerId ?? undefined);
      }
    };
    window.addEventListener("tianguis:booking-paid", onBookingPaid);
    return () => window.removeEventListener("tianguis:booking-paid", onBookingPaid);
  }, [listingId, loadListingScope, loadConversation, selectedId, agreedPriceBuyerId]);

  useEffect(() => {
    const onLifecycle = (ev: Event) => {
      const d = (ev as CustomEvent<{ listingId?: string }>).detail;
      if (
        d?.listingId &&
        d.listingId.trim().toLowerCase() === listingId.trim().toLowerCase()
      ) {
        void loadListingScope({ silent: true });
        if (selectedId) void loadConversation(selectedId, agreedPriceBuyerId ?? undefined);
      }
    };
    window.addEventListener("tianguis:booking-lifecycle", onLifecycle);
    return () => window.removeEventListener("tianguis:booking-lifecycle", onLifecycle);
  }, [listingId, loadListingScope, loadConversation, selectedId, agreedPriceBuyerId]);

  useEffect(() => {
    if (!initialConversationId?.trim() || deepLinkConvLoadedRef.current) return;
    deepLinkConvLoadedRef.current = true;
    void loadConversation(initialConversationId.trim());
  }, [initialConversationId, loadConversation]);

  /** Seller/buyer: selected thread but empty pane — bootstrap messages once (deep link / poll gap). */
  useEffect(() => {
    if (!scopeLoaded || !selectedId) return;
    const norm = normalizeConversationId(selectedId);
    if (messages.length > 0) {
      emptyThreadBootstrapRef.current = norm;
      return;
    }
    if (emptyThreadBootstrapRef.current === norm) return;
    emptyThreadBootstrapRef.current = norm;
    void loadConversation(selectedId, agreedPriceBuyerId ?? undefined);
  }, [scopeLoaded, selectedId, messages.length, loadConversation, agreedPriceBuyerId]);

  useEffect(() => {
    if (role !== "seller" || !initialConversationId?.trim()) return;
    const th = threads.find(
      (t) =>
        normalizeConversationId(t.conversationId) ===
        normalizeConversationId(initialConversationId),
    );
    if (th?.buyer_id) setAgreedPriceBuyerId(String(th.buyer_id));
  }, [role, threads, initialConversationId]);

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

  // Poll selected conversation for new messages (buyer + seller).
  useEffect(() => {
    if (!selectedId) return;
    const intervalMs = role === "seller" ? 2000 : 4000;
    const poll = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/conversations/${encodeURIComponent(selectedId)}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        const fresh: Msg[] = data.messages ?? [];
        setMessages((prev) => applyChatPollUpdate(prev, fresh));
        const lastMsg = fresh[fresh.length - 1];
        if (lastMsg) {
          lastThreadActivityRef.current = threadActivitySig(lastMsg.created_at, lastMsg.body);
        }
      } catch {
        /* silent */
      }
    }, intervalMs);
    return () => clearInterval(poll);
  }, [selectedId, role]);

  // Sellers: refresh thread list + open conversation (mirrors buyer listing-scoped poll).
  useEffect(() => {
    if (role !== "seller" || !listingId) return;
    const poll = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadListingScope({ silent: true });
      if (selectedIdRef.current) void syncConversationMessages(selectedIdRef.current);
    }, 4000);
    return () => clearInterval(poll);
  }, [role, listingId, loadListingScope, syncConversationMessages]);

  useEffect(() => {
    const onContact = () => {
      if (selectedIdRef.current) void syncConversationMessages(selectedIdRef.current);
    };
    window.addEventListener("tianguis:listing-contact", onContact);
    return () => window.removeEventListener("tianguis:listing-contact", onContact);
  }, [syncConversationMessages]);

  // Buyers: re-fetch listing-scoped thread periodically so seller replies appear even if /conversations/[id] lags.
  useEffect(() => {
    if (role !== "buyer" || !listingId) return;
    const poll = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadListingScope({ silent: true });
    }, 4000);
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
            setAgreedErr((d as { error?: string }).error ?? c.loadErr);
            setAgreedPesos("");
          }
          return;
        }
        const cents = (d as { agreedSubtotalMxnCents?: number | null }).agreedSubtotalMxnCents;
        if (!cancelled) {
          setAgreedPesos(cents != null && Number.isFinite(Number(cents)) ? String(Number(cents) / 100) : "");
        }
      } catch {
        if (!cancelled) setAgreedErr(c.networkErrAgreed);
      } finally {
        if (!cancelled) setAgreedLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role, listingId, agreedPriceBuyerId]);

  const loadQuoteState = useCallback(async (opts?: { silent?: boolean }) => {
    if (!requiresQuoteAccept) return;
    if (!opts?.silent) setQuoteLoading(true);
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
      const rawStatus = (d as { quoteStatus?: ServiceQuoteStatus }).quoteStatus ?? "none";
      const sentAt = (d as { quoteSentAt?: string | null }).quoteSentAt ?? null;
      setQuoteStatus(buyerFacingQuoteStatus(rawStatus, sentAt));
      const cents = (d as { agreedSubtotalMxnCents?: number | null }).agreedSubtotalMxnCents;
      setQuoteAgreedCents(cents != null ? Number(cents) : null);
      setQuoteSentAt(sentAt);
      const items = (d as { quoteLineItems?: ServiceQuoteLineItem[] | null }).quoteLineItems;
      setQuoteLineItems(Array.isArray(items) && items.length > 0 ? items : null);
      setQuoteMetadata((d as { quoteMetadata?: ServiceQuoteMetadata | null }).quoteMetadata ?? null);
    } finally {
      if (!opts?.silent) setQuoteLoading(false);
    }
  }, [requiresQuoteAccept, role, agreedPriceBuyerId, listingId]);

  useEffect(() => {
    void loadQuoteState();
  }, [loadQuoteState]);

  // Buyer: poll quote gate so provider quote + accept/decline appear without refresh.
  useEffect(() => {
    if (role !== "buyer" || !requiresQuoteAccept) return;
    const t = setInterval(() => void loadQuoteState({ silent: true }), 2000);
    return () => clearInterval(t);
  }, [role, requiresQuoteAccept, loadQuoteState]);

  useEffect(() => {
    if (role !== "buyer") return;
    const refreshOnVisible = () => {
      if (document.visibilityState !== "visible") return;
      void loadListingScope({ silent: true });
      void loadQuoteState();
      if (selectedId) void loadConversation(selectedId);
    };
    document.addEventListener("visibilitychange", refreshOnVisible);
    return () => document.removeEventListener("visibilitychange", refreshOnVisible);
  }, [role, selectedId, loadListingScope, loadQuoteState, loadConversation]);

  useEffect(() => {
    const onQuote = (ev: Event) => {
      const d = (ev as CustomEvent<{ listingId?: string }>).detail;
      if (d?.listingId && d.listingId !== listingId) return;
      void loadQuoteState();
      if (selectedId) void loadConversation(selectedId, agreedPriceBuyerId ?? undefined);
    };
    window.addEventListener("tianguis:quote-updated", onQuote);
    window.addEventListener("tianguis:agreed-price-updated", onQuote);
    return () => {
      window.removeEventListener("tianguis:quote-updated", onQuote);
      window.removeEventListener("tianguis:agreed-price-updated", onQuote);
    };
  }, [listingId, loadQuoteState, loadConversation, selectedId, agreedPriceBuyerId]);

  // Seller on another device/tab won't get buyer-side quote events — poll quote gate while chat is open.
  useEffect(() => {
    if (role !== "seller" || !requiresQuoteAccept) return;
    if (!selectedId && !agreedPriceBuyerId) return;
    const t = setInterval(() => void loadQuoteState(), 6000);
    return () => clearInterval(t);
  }, [role, requiresQuoteAccept, selectedId, agreedPriceBuyerId, loadQuoteState]);

  useEffect(() => {
    if (role !== "seller") return;
    const refreshOnVisible = () => {
      if (document.visibilityState !== "visible") return;
      void loadListingScope({ silent: true });
      if (selectedId) void loadConversation(selectedId, agreedPriceBuyerId ?? undefined);
      if (requiresQuoteAccept) void loadQuoteState();
    };
    document.addEventListener("visibilitychange", refreshOnVisible);
    return () => document.removeEventListener("visibilitychange", refreshOnVisible);
  }, [
    role,
    selectedId,
    agreedPriceBuyerId,
    requiresQuoteAccept,
    loadListingScope,
    loadConversation,
    loadQuoteState,
  ]);

  useEffect(() => {
    if (!highlightQuote && quoteStatus !== "pending") return;
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

  useEffect(() => {
    if (!highlightRebook) return;
    const t = window.setTimeout(() => {
      document.getElementById("listing-inapp-chat")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 500);
    return () => window.clearTimeout(t);
  }, [highlightRebook]);

  useEffect(() => {
    if (role !== "buyer") return;
    const prefill = buyerContactPrefillFromMetadata(quoteMetadata);
    if (prefill) setBuyerContactPrefill(prefill);
  }, [role, quoteMetadata]);

  useEffect(() => {
    if (role !== "buyer" || !requiresQuoteAccept || rebookPrepareRanRef.current) return;
    if (!highlightRebook && quoteLoading) return;

    const runRebookPrepare = async (reason: "highlight" | "completed") => {
      rebookPrepareRanRef.current = true;
      setRebookPreparing(true);
      setRebookPrepareError("");
      try {
        const r = await fetch(
          `/api/listings/${encodeURIComponent(listingId)}/service-booking/quote/rebook`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lang: lang === "en" ? "en" : "es" }),
          },
        );
        const d = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
        if (!r.ok) {
          const msg = d.message ?? d.error ?? c.prepareRebookErr;
          setRebookPrepareError(msg);
          if (reason === "highlight") return;
        } else {
          await loadQuoteState();
          await loadListingScope();
          window.dispatchEvent(new CustomEvent("tianguis:quote-updated", { detail: { listingId } }));
        }
      } catch {
        setRebookPrepareError(
          lang === "en" ? "Network error preparing rebook form" : c.prepareRebookNetwork,
        );
      } finally {
        setRebookPreparing(false);
      }
    };

    void (async () => {
      const awaitingProvider =
        quoteStatus === "none" && (quoteLineItems?.length ?? 0) > 0;
      const activeQuote = quoteStatus === "pending" || quoteStatus === "accepted";

      if (highlightRebook) {
        if (awaitingProvider || activeQuote) return;
        await runRebookPrepare("highlight");
        return;
      }

      try {
        const sb = await fetch(`/api/listings/${encodeURIComponent(listingId)}/service-booking`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!sb.ok) return;
        const d = (await sb.json()) as {
          paidBookingStatus?: string | null;
          requiresQuoteAccept?: boolean;
        };
        const paidSt = String(d.paidBookingStatus ?? "").toLowerCase();
        if (paidSt !== "completed") return;

        // Only clear stale accepted/pending from a prior job — never wipe a fresh buyer request.
        if (quoteStatus === "accepted" || quoteStatus === "pending") {
          await runRebookPrepare("completed");
        }
      } catch {
        /* non-fatal */
      }
    })();
  }, [
    highlightRebook,
    role,
    requiresQuoteAccept,
    listingId,
    lang,
    loadQuoteState,
    loadListingScope,
    quoteStatus,
    quoteLineItems,
    quoteLoading,
  ]);

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
    if (!r.ok) throw new Error((d as { error?: string; message?: string }).message ?? (d as { error?: string }).error ?? c.sendQuoteErr);
    setAgreedPesos(String(payload.totalCents / 100));
    const connectWarning = (d as { connectWarning?: string | null }).connectWarning;
    if (connectWarning) {
      setAgreedErr(connectWarning);
    }
    const msg = (d as { message?: Msg }).message;
    if (msg) {
      setMessages((m) => [...m, msg]);
      lastThreadActivityRef.current = threadActivitySig(msg.created_at, msg.body);
    }
    window.dispatchEvent(new CustomEvent("tianguis:quote-updated", { detail: { listingId } }));
    window.dispatchEvent(new CustomEvent("tianguis:agreed-price-updated", { detail: { listingId } }));
    await loadQuoteState();
    if (selectedId) await syncConversationMessages(selectedId);
  };

  const submitCleaningRequest = async (payload: QuoteBuilderPayload) => {
    if (role !== "buyer") {
      throw new Error(
        lang === "en"
          ? "Log in as a buyer (not the provider) to send a service request."
          : "Inicia sesión como comprador (no como proveedor) para enviar una solicitud.",
      );
    }
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
        buyerContact: payload.buyerContact,
        lang: lang === "en" ? "en" : "es",
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((d as { error?: string }).error ?? c.sendRequestErr);
    const msg = (d as { message?: Msg }).message;
    const convId = (d as { conversationId?: string }).conversationId;
    if (convId) {
      setSelectedId(convId);
      conversationListingIdRef.current = listingId;
    }
    if (msg) setMessages((m) => [...m, msg]);
    window.dispatchEvent(new CustomEvent("tianguis:listing-contact"));
    window.dispatchEvent(new CustomEvent("tianguis:quote-updated", { detail: { listingId } }));
    await loadQuoteState();
  };

  // Poll thread list for new buyers/messages (seller only).
  useEffect(() => {
    if (role !== "seller") return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/conversations?listingId=${encodeURIComponent(listingId)}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.role !== "seller" || !Array.isArray(data.threads)) return;
        const newThreads = data.threads as Thread[];
        if (selectedId) {
          const active = newThreads.find(
            (t) => normalizeConversationId(t.conversationId) === normalizeConversationId(selectedId),
          );
          const sig = active ? threadActivitySig(active.last_at, active.last_body) : null;
          if (sig && sig !== lastThreadActivityRef.current) {
            lastThreadActivityRef.current = sig;
            void syncConversationMessages(selectedId);
          }
        }
        setThreads(newThreads);
      } catch {
        /* silent */
      }
    }, 4000);
    return () => clearInterval(poll);
  }, [role, listingId, selectedId, syncConversationMessages]);

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
      throw new Error((d as { error?: string }).error ?? c.startChatErr);
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
          if (!cid) throw new Error(c.noConversation);
          conversationListingIdRef.current = listingId;
          setSelectedId(cid);
        }
      }
      if (!cid) throw new Error(c.pickConversation);
      const res = await fetch(`/api/conversations/${cid}/messages`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? c.sendMsgErr);
      }
      const { message } = await res.json();
      const msg = message as Msg;
      setMessages((m) => appendChatMessageDeduped(m, msg));
      lastThreadActivityRef.current = threadActivitySig(msg.created_at, msg.body);
      if (role === "seller" && cid) {
        setThreads((prev) =>
          prev.map((t) =>
            normalizeConversationId(t.conversationId) === normalizeConversationId(cid!)
              ? { ...t, last_body: msg.body, last_at: msg.created_at }
              : t,
          ),
        );
        window.setTimeout(() => {
          if (selectedIdRef.current && normalizeConversationId(selectedIdRef.current) === normalizeConversationId(cid!)) {
            void syncConversationMessages(cid!);
          }
        }, 400);
      }
      if (typeof window !== "undefined") {
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
          throw new Error(lang === "en" ? "Enter a valid amount (at least $1 MXN)." : c.invalidAmount);
        }
      }
      const r = await fetch(`/api/listings/${encodeURIComponent(listingId)}/service-booking/agreed-price`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((d as { error?: string }).error ?? c.saveErr);
      if (clear) setAgreedPesos("");
      window.dispatchEvent(new CustomEvent("tianguis:agreed-price-updated", { detail: { listingId } }));
    } catch (e: unknown) {
      setAgreedErr(e instanceof Error ? e.message : "Error");
    } finally {
      setAgreedSaving(false);
    }
  };

  const rebookPrefillLines = quoteMetadata?.rebookPrefillLineItems;
  const quoteAwaitingProvider =
    quoteStatus === "none" && (quoteLineItems?.length ?? 0) > 0;
  const quoteNeedsBuyerResponse = quoteStatus === "pending" || quoteStatus === "accepted";
  const isRebookFormCycle =
    !quoteNeedsBuyerResponse &&
    (highlightRebook ||
      (quoteStatus === "none" &&
        !(quoteLineItems?.length ?? 0) &&
        (rebookPrefillLines?.length ?? 0) > 0));
  const showBuyerRequestForm =
    role === "buyer" &&
    requiresQuoteAccept &&
    hasServiceMenu(effectiveMenu) &&
    !rebookPreparing &&
    !quoteNeedsBuyerResponse &&
    (isRebookFormCycle ||
      ((quoteStatus === "none" || quoteStatus === "declined") && !quoteAwaitingProvider));
  const showBuyerQuotePanel =
    role === "buyer" &&
    requiresQuoteAccept &&
    !rebookPreparing &&
    quoteNeedsBuyerResponse;
  const rebookCartPrefill =
    rebookPrefillLines?.map((x) => ({ sku: x.sku, qty: x.qty })) ?? undefined;
  const buyerFormKey = `${listingId}-${highlightRebook ? "rebook" : "new"}-${rebookPrefillLines?.length ?? 0}`;

  const refreshChat = async () => {
    await loadListingScope();
    if (requiresQuoteAccept) await loadQuoteState();
    if (selectedId) {
      if (role === "seller") {
        await loadConversation(selectedId, agreedPriceBuyerId ?? undefined);
      } else {
        await syncConversationMessages(selectedId);
      }
    }
  };

  if (!scopeLoaded && !selectedId) {
    return (
      <div
        id="listing-inapp-chat"
        className="rounded-xl border border-[#E5E0D8] bg-white p-4 text-center text-sm text-[#6B7280]"
      >
        {c.loading}
      </div>
    );
  }

  if (scopeLoaded && !role) {
    return (
      <div id="listing-inapp-chat" className="rounded-xl border border-[#E5E0D8] bg-[#F4F0EB] p-4 text-center">
        <p className="text-sm text-[#374151] mb-3">{c.loginLead}</p>
        <Link
          href={`/auth/login?returnTo=${encodeURIComponent(loginReturnTo ?? `/listing/${listingId}`)}`}
          className="inline-block px-4 py-2 rounded-xl bg-[#1B4332] text-white text-sm font-semibold"
        >
          {c.loginBtn}
        </Link>
      </div>
    );
  }

  return (
    <div id="listing-inapp-chat" className="rounded-xl border border-[#E5E0D8] bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-[#E5E0D8] bg-[#F4F0EB] flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-[#1C1917]">{c.title}</h3>
          <p className="text-xs text-[#6B7280] mt-0.5">{c.subtitle}</p>
          {role === "buyer" && buyerTicketCode ? (
            <p className="text-xs font-mono font-bold text-[#065F46] mt-1">{buyerTicketCode}</p>
          ) : null}
        </div>
        {showFullListingLink && fullListingHref ? (
          <Link
            href={`${fullListingHref}#listing-top`}
            className="text-xs font-semibold text-[#1B4332] hover:underline shrink-0"
          >
            {c.viewListing}
          </Link>
        ) : null}
        {role === "buyer" || role === "seller" ? (
          <button
            type="button"
            onClick={() => void refreshChat()}
            className="text-xs font-semibold text-[#1B4332] hover:underline shrink-0"
          >
            {c.refresh}
          </button>
        ) : null}
      </div>

      {role === "buyer" && rebookPrepareError ? (
        <div className="px-4 py-2 border-b border-red-200 bg-red-50 text-xs text-red-800">
          {rebookPrepareError}
        </div>
      ) : null}

      {role === "buyer" && rebookPreparing ? (
        <div className="px-4 py-2 border-b border-[#E5E0D8] bg-[#FFFBEB] text-xs text-[#78350F]">
          {c.rebookPreparing}
        </div>
      ) : null}

      {role === "seller" && threads.length > 0 && (
        <div className="border-b border-[#E5E0D8]">
          <p className="px-4 pt-2 pb-1 text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
            {c.recentBuyers(threads.length, threadsTotal)}
          </p>
          <div className="max-h-36 overflow-y-auto divide-y divide-[#E5E0D8]">
            {threads.map((t) => {
              const isActive =
                selectedId != null &&
                normalizeConversationId(selectedId) === normalizeConversationId(t.conversationId);
              const label = t.ticket_code ? `${t.ticket_code} · ${t.buyer_name}` : t.buyer_name;
              return (
                <button
                  key={t.conversationId}
                  type="button"
                  onClick={() => {
                    userPickedThreadRef.current = true;
                    void loadConversation(t.conversationId, t.buyer_id);
                  }}
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
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`font-semibold truncate ${isActive ? "text-[#065F46]" : "text-[#1C1917]"}`}>
                        {label}
                      </span>
                      <span className="text-[10px] text-[#9CA3AF] shrink-0 tabular-nums">
                        {formatDateTimeShort(t.last_at, lang)}
                      </span>
                    </div>
                    <span className="block text-xs text-[#6B7280] truncate">{t.last_body || c.noMessagesYet}</span>
                  </div>
                  {isActive && <span className="text-[#059669] text-xs">●</span>}
                </button>
              );
            })}
          </div>
          {threadsTotal > threads.length ? (
            <p className="px-4 py-2 text-[10px] text-[#6B7280] border-t border-[#E5E0D8]">
              <Link href={withLang("/messages", lang)} className="font-semibold text-[#1B4332] hover:underline">
                {c.allConversations}
              </Link>
            </p>
          ) : null}
        </div>
      )}

      {role === "seller" && threads.length === 0 && (
        <p className="px-4 py-3 text-sm text-[#6B7280]">{c.noBuyerThreads}</p>
      )}

      {/* Active chat header — shows who you're talking to */}
      {role === "seller" && selectedId && (() => {
        const active = threads.find(
          (t) => normalizeConversationId(t.conversationId) === normalizeConversationId(selectedId),
        );
        return active ? (
          <div className="px-4 py-2 bg-[#ECFDF5] border-b border-[#A7F3D0] flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#1B4332] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {(active.buyer_name?.[0] ?? "C").toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[#065F46] truncate">
                {active.ticket_code ? `${active.ticket_code} · ` : ""}
                {c.chatWith}: {active.buyer_name}
              </p>
            </div>
            <span className="text-[10px] text-[#059669] font-semibold px-2 py-0.5 rounded-full bg-[#D1FAE5]">{c.active}</span>
          </div>
        ) : null;
      })()}

      {role === "seller" && selectedId && (
        <div className="px-4 py-2 border-b border-[#E5E0D8] bg-[#FFFBEB] text-xs space-y-2">
          {!requiresQuoteAccept ? (
            <>
              <p className="font-semibold text-[#78350F]">{c.agreedTitle}</p>
              <p className="text-[#92400E] leading-snug">{c.agreedHelp}</p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex-1 min-w-[120px]">
                  <span className="sr-only">MXN</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={agreedPesos}
                    onChange={(e) => setAgreedPesos(e.target.value)}
                    disabled={!agreedPriceBuyerId || agreedSaving}
                    placeholder={c.agreedPh}
                    className="w-full rounded-lg border border-amber-200 px-2 py-1.5 text-sm text-[#1C1917] outline-none focus:border-[#B45309]"
                  />
                </label>
                <button
                  type="button"
                  disabled={!agreedPriceBuyerId || agreedLoading || agreedSaving}
                  onClick={() => void saveAgreedPrice(false)}
                  className="px-3 py-1.5 rounded-lg bg-[#B45309] text-white text-[11px] font-semibold disabled:opacity-40"
                >
                  {agreedSaving ? "…" : c.agreedSave}
                </button>
                <button
                  type="button"
                  disabled={!agreedPriceBuyerId || agreedLoading || agreedSaving}
                  onClick={() => void saveAgreedPrice(true)}
                  className="px-3 py-1.5 rounded-lg border border-amber-300 text-[#78350F] text-[11px] font-semibold disabled:opacity-40"
                >
                  {c.agreedClear}
                </button>
              </div>
              {agreedLoading ? (
                <p className="text-[#A16207]">{c.agreedLoading}</p>
              ) : !agreedPriceBuyerId && selectedId ? (
                <p className="text-[#A16207]">{c.loadingThread}</p>
              ) : null}
            </>
          ) : null}
          {agreedErr ? <p className="text-red-600">{agreedErr}</p> : null}
          {requiresQuoteAccept &&
            quoteStatus === "none" &&
            quoteLineItems != null &&
            quoteLineItems.length > 0 &&
            hasServiceMenu(effectiveMenu) && (
              <ServiceQuoteSellerRequestPanel
                lineItems={quoteLineItems}
                metadata={quoteMetadata}
                menu={effectiveMenu}
                lang={lang === "en" ? "en" : "es"}
                quoteLayout={quoteLayout}
                providerSlug={providerSlug}
              />
            )}
          {hasServiceMenu(effectiveMenu) && agreedPriceBuyerId && (
            <ServiceMenuQuoteBuilder
              menu={effectiveMenu}
              lang={lang === "en" ? "en" : "es"}
              quoteLayout={quoteLayout}
              requiresBuyerContact={requiresQuoteAccept}
              providerSlug={providerSlug}
              variant="seller"
              disabled={agreedSaving || agreedLoading}
              initialCartLines={quoteLineItems?.map((x) => ({ sku: x.sku, qty: x.qty }))}
              initialVisitFrequency={quoteMetadata?.visitFrequency}
              initialQuoteBasis={quoteMetadata?.quoteBasis}
              onApplyTotal={requiresQuoteAccept ? undefined : (pesos) => setAgreedPesos(pesos)}
              onSendOfficialQuote={requiresQuoteAccept ? sendOfficialQuote : undefined}
              onInsertAsMessage={
                requiresQuoteAccept
                  ? undefined
                  : async (body) => {
                      try {
                        await postMessageBody(body);
                      } catch (e: unknown) {
                        setAgreedErr(e instanceof Error ? e.message : "Error");
                      }
                    }
              }
            />
          )}
        </div>
      )}

      {role === "buyer" && requiresQuoteAccept && hasServiceMenu(effectiveMenu) && quoteAwaitingProvider && !isRebookFormCycle && (
        <div className="px-4 py-2 border-b border-[#E5E0D8] bg-blue-50 text-xs text-blue-900">
          {c.requestSent}
        </div>
      )}

      {showBuyerRequestForm && (
        <div className="px-4 py-2 border-b border-[#E5E0D8] bg-[#FFFBEB]">
          {isRebookFormCycle ? (
            <p className="text-xs text-[#78350F] font-medium mb-2">
              {c.rebookLead}
            </p>
          ) : null}
          <ServiceMenuQuoteBuilder
            key={buyerFormKey}
            menu={effectiveMenu}
            lang={lang === "en" ? "en" : "es"}
            quoteLayout={quoteLayout}
            requiresBuyerContact={requiresQuoteAccept}
            providerSlug={providerSlug}
            variant="buyer"
            disabled={sending || quoteLoading}
            initialBuyerContact={buyerContactPrefill}
            initialCartLines={rebookCartPrefill}
            initialVisitFrequency={quoteMetadata?.visitFrequency}
            initialQuoteBasis={quoteMetadata?.quoteBasis}
            onSubmitRequest={submitCleaningRequest}
          />
        </div>
      )}

      {showBuyerQuotePanel && (
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
            {c.quoteStatus}:{" "}
            <span className="text-[#92400E]">
              {quoteStatus === "pending"
                ? c.quotePending
                : quoteStatus === "accepted"
                  ? c.quoteAccepted
                  : c.quoteDeclined}
            </span>
          </p>
          {quoteAgreedCents != null && quoteAgreedCents > 0 ? (
            <p className="text-[#92400E] mt-1">
              {lang === "en" ? "Total" : c.total}:{" "}
              {new Intl.NumberFormat(lang === "en" ? "en-MX" : "es-MX", {
                style: "currency",
                currency: "MXN",
                maximumFractionDigits: 0,
              }).format(quoteAgreedCents / 100)}
            </p>
          ) : null}
          {quoteStatus === "declined" ? (
            <p className="text-[#B45309] mt-2 leading-snug">
              {c.quoteDeclinedHint}
            </p>
          ) : null}
        </div>
      )}

      <div
        ref={messagesScrollRef}
        className="max-h-64 overflow-y-auto overflow-x-hidden px-4 py-3 space-y-2 overscroll-y-contain"
      >
        {messages.map((m, idx) => {
          const senderNorm = String(m.sender_id).trim().toLowerCase();
          const mine =
            (myUserId && senderNorm === myUserId.trim().toLowerCase()) ||
            (myAccountPool.length > 0 && myAccountPool.includes(senderNorm));
          const isSystem = m.body.startsWith("[Naranjogo]");
          const displayBody = isSystem ? formatListingChatSystemBody(m.body, role, lang) : m.body;
          const dayKey = conversationDayKey(m.created_at);
          const prevDayKey = idx > 0 ? conversationDayKey(messages[idx - 1].created_at) : null;
          const showDay = dayKey !== prevDayKey;
          return (
            <div key={m.id} className="space-y-2">
              {showDay ? (
                <p className="text-center text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wide py-1">
                  {formatConversationDayLabel(m.created_at, lang)}
                </p>
              ) : null}
              <div className={`flex ${isSystem ? "justify-center" : mine ? "justify-end" : "justify-start"}`}>
                <div className={`flex flex-col gap-0.5 max-w-[85%] ${mine ? "items-end" : "items-start"}`}>
                  <div
                    className={`rounded-xl px-3 py-2 text-sm ${
                      isSystem
                        ? "bg-amber-50 border border-amber-200 text-amber-950 text-xs leading-relaxed"
                        : mine
                          ? "bg-[#1B4332] text-white"
                          : "bg-[#F4F0EB] text-[#1C1917]"
                    }`}
                  >
                    {displayBody}
                  </div>
                  {!isSystem ? (
                    <span className={`text-[10px] tabular-nums ${mine ? "text-[#9CA3AF]" : "text-[#9CA3AF]"}`}>
                      {formatDateTimeShort(m.created_at, lang)}
                    </span>
                  ) : null}
                </div>
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
          placeholder={role === "seller" && !selectedId ? c.placeholderSeller : c.placeholder}
          disabled={(role === "seller" && !selectedId) || sending}
          className="flex-1 rounded-xl border border-[#E5E0D8] px-3 py-2 text-sm outline-none focus:border-[#1B4332]"
        />
        <button
          type="button"
          disabled={(role === "seller" && !selectedId) || sending || !draft.trim()}
          onClick={() => void sendMessage()}
          className="px-4 py-2 rounded-xl bg-[#1B4332] text-white text-sm font-semibold disabled:opacity-40"
        >
          {sending ? "…" : c.send}
        </button>
      </div>

      <div className="px-3 pb-3 text-center">
        <Link href={withLang("/messages", lang)} className="text-xs text-[#1B4332] font-semibold hover:underline">
          {c.allMessages}
        </Link>
      </div>
    </div>
  );
}
