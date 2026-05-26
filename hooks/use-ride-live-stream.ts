"use client";

import { useEffect, useRef } from "react";

type UseRideLiveStreamArgs = {
  /** SSE URL; null disables the stream. */
  streamUrl: string | null;
  enabled?: boolean;
  onEvent: (payload: unknown) => void;
  /** Slow poll when stream is up (backup if Realtime misses an event). */
  fallbackPollMs?: number;
  onFallbackPoll?: () => void;
};

/**
 * Live ride updates via same-origin SSE (cookies auth).
 * Reconnects automatically after disconnect.
 */
export function useRideLiveStream({
  streamUrl,
  enabled = true,
  onEvent,
  fallbackPollMs = 30_000,
  onFallbackPoll,
}: UseRideLiveStreamArgs): void {
  const onEventRef = useRef(onEvent);
  const onFallbackRef = useRef(onFallbackPoll);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    onFallbackRef.current = onFallbackPoll;
  }, [onFallbackPoll]);

  useEffect(() => {
    if (!enabled || !streamUrl) return;

    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      es?.close();
      es = new EventSource(streamUrl, { withCredentials: true });

      es.onmessage = (ev) => {
        try {
          onEventRef.current(JSON.parse(ev.data));
        } catch {
          /* ignore malformed */
        }
      };

      es.onerror = () => {
        es?.close();
        es = null;
        if (!closed) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      };
    };

    connect();

    const fallback =
      onFallbackRef.current && fallbackPollMs > 0
        ? setInterval(() => onFallbackRef.current?.(), fallbackPollMs)
        : null;

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
      if (fallback) clearInterval(fallback);
    };
  }, [enabled, streamUrl, fallbackPollMs]);
}
