import { useEffect, useRef, useState, useCallback } from "react";
import { CaptionEvent } from "../types";
import { getWebSocketBaseUrl, getConfig } from "../utils/config";

export type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

interface UseCaptionStreamOptions {
  roomId: string;
  lang?: string;
  mode?: "all" | "final";
  maxHistory?: number;
}

export function useCaptionStream({
  roomId,
  lang = "es",
  mode = "all",
  maxHistory = 100,
}: UseCaptionStreamOptions) {
  const [history, setHistory] = useState<CaptionEvent[]>([]);
  const [activePartial, setActivePartial] = useState<CaptionEvent | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [latencyMs, setLatencyMs] = useState<number>(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);

  const clearReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    clearReconnect();

    // Determine WebSocket URL from dynamic backend configuration
    const baseUrl = getWebSocketBaseUrl();
    const cfg = getConfig();
    const params = new URLSearchParams({
      lang,
      mode,
    });
    if (cfg.apiKey) {
      params.set("api_key", cfg.apiKey);
    }
    if (cfg.providerMode) {
      params.set("provider", cfg.providerMode);
    }

    const wsUrl = `${baseUrl}/ws/stream/${encodeURIComponent(roomId)}?${params.toString()}`;

    setConnectionState("connecting");

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionState("connected");
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          if (payload.type === "init") {
            if (payload.history && Array.isArray(payload.history)) {
              setHistory(payload.history);
            }
            if (payload.active_partial) {
              setActivePartial(payload.active_partial);
            }
          } else if (payload.type === "caption" && payload.data) {
            const caption: CaptionEvent = payload.data;

            // Measure client arrival latency
            const now = Date.now();
            const eventTime = new Date(caption.timestamp_iso).getTime();
            if (!isNaN(eventTime)) {
              const diff = Math.max(15, now - eventTime);
              setLatencyMs(diff);
            }

            if (caption.is_final) {
              setActivePartial(null);
              setHistory((prev) => {
                const next = [...prev, caption];
                return next.length > maxHistory ? next.slice(-maxHistory) : next;
              });
            } else {
              setActivePartial(caption);
            }
          }
        } catch (err) {
          console.error("Failed to parse caption message:", err);
        }
      };

      ws.onclose = () => {
        setConnectionState("disconnected");
        // Exponential backoff reconnect
        const attempts = reconnectAttemptsRef.current;
        const delay = Math.min(1000 * Math.pow(1.5, attempts), 8000);
        reconnectAttemptsRef.current += 1;
        reconnectTimeoutRef.current = window.setTimeout(connect, delay);
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        setConnectionState("error");
      };
    } catch (e) {
      setConnectionState("error");
    }
  }, [roomId, lang, mode, maxHistory, clearReconnect]);

  useEffect(() => {
    connect();

    return () => {
      clearReconnect();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, clearReconnect]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setActivePartial(null);
  }, []);

  return {
    history,
    activePartial,
    connectionState,
    latencyMs,
    clearHistory,
    reconnect: connect,
  };
}
