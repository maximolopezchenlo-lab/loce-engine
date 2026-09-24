/**
 * Global configuration & localStorage manager for LOCE client.
 * Handles dynamic API keys, inference provider modes, and backend URL resolution.
 */

export const STORAGE_KEYS = {
  GEMINI_API_KEY: "loce_gemini_api_key",
  PROVIDER_MODE: "loce_provider_mode",
  GEMMA_ENDPOINT: "loce_gemma_endpoint",
  GEMMA_MODEL: "loce_gemma_model",
  BACKEND_URL: "loce_backend_url",
  HAS_ONBOARDED: "loce_has_onboarded",
} as const;

export type ProviderMode = "gemini" | "gemma" | "mock";

export interface LoceConfig {
  apiKey: string;
  providerMode: ProviderMode;
  gemmaEndpoint: string;
  gemmaModel: string;
  backendUrl: string;
  hasOnboarded: boolean;
}

export function getConfig(): LoceConfig {
  if (typeof window === "undefined") {
    return {
      apiKey: "",
      providerMode: "gemini",
      gemmaEndpoint: "http://localhost:11434",
      gemmaModel: "gemma4:2b",
      backendUrl: "",
      hasOnboarded: false,
    };
  }

  const apiKey = localStorage.getItem(STORAGE_KEYS.GEMINI_API_KEY) || "";
  const rawMode = localStorage.getItem(STORAGE_KEYS.PROVIDER_MODE);
  const providerMode: ProviderMode =
    rawMode === "gemma" || rawMode === "mock" || rawMode === "gemini"
      ? rawMode
      : "gemini";
  const gemmaEndpoint =
    localStorage.getItem(STORAGE_KEYS.GEMMA_ENDPOINT) || "http://localhost:11434";
  const gemmaModel =
    localStorage.getItem(STORAGE_KEYS.GEMMA_MODEL) || "gemma4:2b";
  const backendUrl = localStorage.getItem(STORAGE_KEYS.BACKEND_URL) || "";
  const hasOnboarded =
    localStorage.getItem(STORAGE_KEYS.HAS_ONBOARDED) === "true";

  return { apiKey, providerMode, gemmaEndpoint, gemmaModel, backendUrl, hasOnboarded };
}

export function saveConfig(updates: Partial<LoceConfig>): void {
  if (typeof window === "undefined") return;

  if (updates.apiKey !== undefined) {
    localStorage.setItem(STORAGE_KEYS.GEMINI_API_KEY, updates.apiKey.trim());
  }
  if (updates.providerMode !== undefined) {
    localStorage.setItem(STORAGE_KEYS.PROVIDER_MODE, updates.providerMode);
  }
  if (updates.gemmaEndpoint !== undefined) {
    localStorage.setItem(
      STORAGE_KEYS.GEMMA_ENDPOINT,
      updates.gemmaEndpoint.trim()
    );
  }
  if (updates.gemmaModel !== undefined) {
    localStorage.setItem(STORAGE_KEYS.GEMMA_MODEL, updates.gemmaModel.trim());
  }
  if (updates.backendUrl !== undefined) {
    localStorage.setItem(STORAGE_KEYS.BACKEND_URL, updates.backendUrl.trim());
  }
  if (updates.hasOnboarded !== undefined) {
    localStorage.setItem(
      STORAGE_KEYS.HAS_ONBOARDED,
      updates.hasOnboarded ? "true" : "false"
    );
  }
}

/**
 * Resolves the HTTP origin for REST calls.
 */
export function getResolvedBackendUrl(): string {
  if (typeof window === "undefined") {
    return "http://localhost:8000";
  }

  const stored = localStorage.getItem(STORAGE_KEYS.BACKEND_URL)?.trim();
  if (stored) {
    return stored.replace(/\/+$/, "");
  }

  const envUrl = (import.meta as unknown as { env?: { VITE_BACKEND_URL?: string } })
    .env?.VITE_BACKEND_URL;
  if (envUrl) {
    return envUrl.replace(/\/+$/, "");
  }

  if (window.location.port === "5173") {
    return `http://${window.location.hostname}:8000`;
  }

  return window.location.origin;
}

/**
 * Resolves the WebSocket base origin (ws:// or wss://).
 */
export function getWebSocketBaseUrl(): string {
  const backend = getResolvedBackendUrl();
  try {
    const url = new URL(backend);
    const wsProto = url.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProto}//${url.host}`;
  } catch {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host =
      window.location.port === "5173"
        ? `${window.location.hostname}:8000`
        : window.location.host;
    return `${protocol}//${host}`;
  }
}

/**
 * Builds a full API path against the configured backend.
 */
export function getApiUrl(path: string): string {
  const backend = getResolvedBackendUrl();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${backend}${cleanPath}`;
}
