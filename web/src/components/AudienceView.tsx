import React, { useState, useRef, useEffect } from "react";
import {
  Radio,
  Eye,
  ArrowDown,
  Download,
  Wifi,
  WifiOff,
  Layers,
  Sun,
  Moon,
  Settings,
} from "lucide-react";
import { useCaptionStream } from "../hooks/useCaptionStream";
import { RoomSummary } from "../types";
import { getApiUrl } from "../utils/config";
import { LoceLogo } from "./LoceLogo";

interface AudienceViewProps {
  initialRoomId?: string;
  initialLang?: string;
  availableRooms?: RoomSummary[];
  onOpenSettings?: () => void;
}

export const AudienceView: React.FC<AudienceViewProps> = ({
  initialRoomId = "main-stage",
  initialLang = "es",
  availableRooms = [],
  onOpenSettings,
}) => {
  // Sync with URL query parameters if present
  const [roomId, setRoomId] = useState(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search).get("room");
      if (p) return p;
    }
    return initialRoomId;
  });

  const [lang, setLang] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search).get("lang");
      if (p) return p;
    }
    return initialLang;
  });

  const [fontSize, setFontSize] = useState<"sm" | "md" | "lg" | "xl">("lg");
  const [themeMode, setThemeMode] = useState<"dark" | "light" | "contrast">("dark");
  const [autoScroll, setAutoScroll] = useState(true);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollBottomAnchorRef = useRef<HTMLDivElement>(null);

  const { history, activePartial, connectionState, latencyMs } = useCaptionStream({
    roomId,
    lang,
    mode: "all",
  });

  const handleLanguageChange = (newLang: string) => {
    setLang(newLang);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("lang", newLang);
      window.history.replaceState({}, "", url.toString());
    }
  };

  const handleRoomChange = (newRoom: string) => {
    setRoomId(newRoom);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("room", newRoom);
      window.history.replaceState({}, "", url.toString());
    }
  };

  // Handle auto-scroll with manual freeze detection
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 60;

    if (!isAtBottom) {
      setUserScrolledUp(true);
      setAutoScroll(false);
    } else {
      setUserScrolledUp(false);
      setAutoScroll(true);
    }
  };

  useEffect(() => {
    if (autoScroll && scrollBottomAnchorRef.current) {
      scrollBottomAnchorRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [history, activePartial, autoScroll]);

  const resumeScroll = () => {
    setAutoScroll(true);
    setUserScrolledUp(false);
    if (scrollBottomAnchorRef.current) {
      scrollBottomAnchorRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  const isHighContrast = themeMode === "contrast";
  const isLight = themeMode === "light";
  const isDark = themeMode === "dark";

  const fontSizeClasses = {
    sm: "text-base sm:text-lg leading-relaxed",
    md: "text-lg sm:text-xl leading-relaxed",
    lg: "text-xl sm:text-2xl leading-normal",
    xl: "text-2xl sm:text-3xl leading-normal font-medium",
  }[fontSize];

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-200 ${
        isHighContrast
          ? "bg-black text-yellow-300 font-medium"
          : isLight
          ? "bg-slate-50 text-slate-900"
          : "bg-slate-950 text-slate-100"
      }`}
    >
      {/* Accessibility Live Region for Screen Readers */}
      <div
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
      >
        {activePartial?.text}
      </div>

      {/* Top Header & Conference Controls */}
      <header
        className={`sticky top-0 z-20 border-b backdrop-blur-md px-3 sm:px-6 py-3 transition-colors ${
          isHighContrast
            ? "bg-black/95 border-b-2 border-yellow-300"
            : isLight
            ? "bg-white/95 border-slate-200 shadow-sm"
            : "bg-slate-900/80 border-slate-800"
        }`}
      >
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Brand & Room Selector */}
          <div className="flex items-center justify-between sm:justify-start gap-2.5">
            <LoceLogo
              size={34}
              showText={true}
              showSubtitle={true}
              animate={connectionState === "connected"}
              theme={isHighContrast ? "high-contrast" : isLight ? "light" : "dark"}
            />

            <div className={`h-6 w-px hidden sm:block ${isLight ? "bg-slate-200" : "bg-slate-800"}`} />

            {/* Room Selector */}
            <div className="flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 opacity-70 hidden sm:block" />
              <select
                value={roomId}
                onChange={(e) => handleRoomChange(e.target.value)}
                className={`rounded-lg px-2 py-1 sm:px-2.5 sm:py-1.5 text-xs sm:text-sm font-medium border transition-colors outline-none focus:ring-2 focus:ring-indigo-500 max-w-[130px] sm:max-w-none ${
                  isHighContrast
                    ? "bg-black text-yellow-300 border-yellow-300"
                    : isLight
                    ? "bg-white text-slate-900 border-slate-300 hover:border-slate-400"
                    : "bg-slate-800/80 border-slate-700 text-slate-200 hover:border-slate-600"
                }`}
                aria-label="Select Conference Track"
              >
                {availableRooms.length > 0 ? (
                  availableRooms.map((r) => (
                    <option key={r.room_id} value={r.room_id}>
                      {r.name} ({r.room_id})
                    </option>
                  ))
                ) : (
                  <>
                    <option value="main-stage">Main Auditorium</option>
                    <option value="track-1">Engineering Track</option>
                    <option value="track-2">AI & Systems Track</option>
                  </>
                )}
              </select>
            </div>

            {/* Mobile Connection status indicator */}
            <div
              className={`md:hidden flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold border ${
                connectionState === "connected"
                  ? isHighContrast
                    ? "bg-black text-yellow-300 border-yellow-300"
                    : isLight
                    ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                    : "bg-emerald-950/50 text-emerald-400 border-emerald-800/60"
                  : isLight
                  ? "bg-rose-50 text-rose-700 border-rose-300"
                  : "bg-rose-950/50 text-rose-400 border-rose-800/60"
              }`}
            >
              {connectionState === "connected" ? (
                <>
                  <Wifi className="w-2.5 h-2.5 animate-pulse text-emerald-500" />
                  <span>{latencyMs > 0 ? `${latencyMs}ms` : "Live"}</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-2.5 h-2.5 text-rose-500" />
                  <span>Offline</span>
                </>
              )}
            </div>
          </div>

          {/* Controls: Language, Theme, Font, Downloads */}
          <div className="flex items-center flex-wrap gap-2 justify-between sm:justify-end">
            {/* 8-Language Selector: 4x2 grid on mobile, flex on desktop */}
            <div
              className={`grid grid-cols-4 sm:flex sm:flex-wrap gap-1 rounded-xl p-1 border transition-colors ${
                isHighContrast
                  ? "bg-black border-yellow-300"
                  : isLight
                  ? "bg-slate-100 border-slate-200"
                  : "bg-slate-800/60 border-slate-700/60"
              }`}
            >
              {[
                { code: "es", label: "ES", title: "Español" },
                { code: "en", label: "EN", title: "English" },
                { code: "pt", label: "PT", title: "Português" },
                { code: "fr", label: "FR", title: "Français" },
                { code: "de", label: "DE", title: "Deutsch" },
                { code: "it", label: "IT", title: "Italiano" },
                { code: "ru", label: "RU", title: "Русский" },
                { code: "zh", label: "ZH", title: "中文" },
              ].map((item) => {
                const isActive = lang === item.code;
                return (
                  <button
                    key={item.code}
                    onClick={() => handleLanguageChange(item.code)}
                    title={item.title}
                    className={`px-2 py-1 text-xs font-bold rounded-lg transition-all text-center ${
                      isActive
                        ? isHighContrast
                          ? "bg-yellow-300 text-black font-extrabold shadow"
                          : isLight
                          ? "bg-indigo-700 text-white shadow-sm"
                          : "bg-indigo-500 text-slate-950 font-extrabold shadow-md shadow-indigo-600/30"
                        : isHighContrast
                        ? "text-yellow-300 hover:bg-yellow-300/20"
                        : isLight
                        ? "text-slate-700 hover:text-slate-950 hover:bg-slate-200/60"
                        : "text-slate-300 hover:text-white hover:bg-slate-700/50"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            {/* Controls Group: Theme Modes, Font Sizing, Exports */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Theme Mode Selector (Dark, Light, WCAG AAA High Contrast) */}
              <div
                className={`flex items-center gap-0.5 rounded-xl p-1 border ${
                  isHighContrast
                    ? "bg-black border-yellow-300"
                    : isLight
                    ? "bg-slate-100 border-slate-200"
                    : "bg-slate-800/60 border-slate-700/60"
                }`}
                role="group"
                aria-label="Selector de tema de contraste"
              >
                <button
                  type="button"
                  onClick={() => setThemeMode("dark")}
                  className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                    isDark
                      ? "bg-indigo-600 text-white shadow-sm"
                      : isLight
                      ? "text-slate-600 hover:text-slate-900"
                      : "text-slate-400 hover:text-white"
                  }`}
                  title="Modo Oscuro"
                  aria-label="Modo Oscuro"
                >
                  <Moon className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setThemeMode("light")}
                  className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                    isLight
                      ? "bg-indigo-700 text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                  title="Modo Claro"
                  aria-label="Modo Claro"
                >
                  <Sun className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setThemeMode("contrast")}
                  className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                    isHighContrast
                      ? "bg-yellow-300 text-black font-extrabold shadow-sm"
                      : isLight
                      ? "text-slate-600 hover:text-slate-900"
                      : "text-slate-400 hover:text-white"
                  }`}
                  title="Modo Alto Contraste (WCAG AAA)"
                  aria-label="Modo Alto Contraste (WCAG AAA)"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Font Sizing (WCAG AAA contrast verified > 7:1) */}
              <div
                className={`flex items-center gap-0.5 rounded-xl p-1 border ${
                  isHighContrast
                    ? "bg-black border-yellow-300"
                    : isLight
                    ? "bg-slate-100 border-slate-200"
                    : "bg-slate-800/60 border-slate-700/60"
                }`}
              >
                {(["sm", "md", "lg", "xl"] as const).map((s) => {
                  const isActive = fontSize === s;
                  return (
                    <button
                      key={s}
                      onClick={() => setFontSize(s)}
                      className={`w-6 h-6 sm:w-7 sm:h-7 text-xs font-bold rounded-lg flex items-center justify-center transition-all ${
                        isActive
                          ? isHighContrast
                            ? "bg-yellow-300 text-black font-extrabold"
                            : isLight
                            ? "bg-indigo-700 text-white shadow-sm"
                            : "bg-indigo-500 text-slate-950 font-extrabold"
                          : isHighContrast
                          ? "text-yellow-300 hover:bg-yellow-300/20"
                          : isLight
                          ? "text-slate-700 hover:text-slate-950 hover:bg-slate-200/60"
                          : "text-slate-300 hover:text-white hover:bg-slate-700/50"
                      }`}
                      title={`Tamaño: ${s.toUpperCase()}`}
                    >
                      {s.toUpperCase()}
                    </button>
                  );
                })}
              </div>

              {/* Download Transcripts */}
              <div className="flex items-center gap-1">
                <a
                  href={getApiUrl(`/api/rooms/${roomId}/export/srt?lang=${lang}`)}
                  download
                  className={`px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1 transition-all ${
                    isHighContrast
                      ? "border-yellow-300 text-yellow-300 hover:bg-yellow-300 hover:text-black"
                      : isLight
                      ? "border-slate-300 bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 shadow-sm"
                      : "border-slate-700/60 bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white"
                  }`}
                  title="Descargar Subtítulos SRT"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>SRT</span>
                </a>
                <a
                  href={getApiUrl(`/api/rooms/${roomId}/export/vtt?lang=${lang}`)}
                  download
                  className={`px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1 transition-all ${
                    isHighContrast
                      ? "border-yellow-300 text-yellow-300 hover:bg-yellow-300 hover:text-black"
                      : isLight
                      ? "border-slate-300 bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 shadow-sm"
                      : "border-slate-700/60 bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white"
                  }`}
                  title="Descargar Subtítulos WebVTT"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>VTT</span>
                </a>

                {/* Settings Modal trigger button */}
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
                      isHighContrast
                        ? "border-yellow-300 text-yellow-300 hover:bg-yellow-300 hover:text-black"
                        : isLight
                        ? "border-indigo-300 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 shadow-sm"
                        : "border-indigo-700/60 bg-indigo-950/40 hover:bg-indigo-900/60 text-indigo-300 hover:text-white"
                    }`}
                    title="Configuración de IA y Backend"
                    aria-label="Abrir modal de configuración"
                  >
                    <Settings className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="hidden md:inline">Configuración</span>
                  </button>
                )}
              </div>

              {/* Desktop Connection & Latency Badge */}
              <div
                className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  connectionState === "connected"
                    ? isHighContrast
                      ? "bg-black text-yellow-300 border-yellow-300"
                      : isLight
                      ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                      : "bg-emerald-950/40 text-emerald-400 border-emerald-800/60"
                    : isLight
                    ? "bg-rose-50 text-rose-800 border-rose-300"
                    : "bg-rose-950/40 text-rose-400 border-rose-800/60"
                }`}
              >
                {connectionState === "connected" ? (
                  <>
                    <Wifi className="w-3.5 h-3.5 animate-pulse text-emerald-500" />
                    <span>{latencyMs > 0 ? `${latencyMs}ms` : "Live"}</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3.5 h-3.5 text-rose-500" />
                    <span>Conectando</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Subtitle Display Canvas */}
      <main
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-8 max-w-5xl mx-auto w-full flex flex-col space-y-6"
      >
        {history.length === 0 && !activePartial && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-24 opacity-70">
            <Radio className="w-12 h-12 mb-4 text-indigo-500 animate-pulse" />
            <h3 className="text-xl font-semibold mb-1">Awaiting Speaker Audio...</h3>
            <p className="text-sm max-w-md">
              Audio stream is active in <span className="font-mono text-indigo-500 font-semibold">{roomId}</span>.
              Captions and translations will stream in real-time as speech is detected.
            </p>
          </div>
        )}

        {/* Finalized Transcript Segments */}
        {history.map((seg) => (
          <article
            key={seg.id}
            className={`p-4 sm:p-5 rounded-2xl transition-all ${
              isHighContrast
                ? "border-2 border-yellow-300 bg-black text-yellow-300 shadow-md shadow-yellow-300/10"
                : isLight
                ? "bg-white border border-slate-200/90 shadow-sm hover:border-slate-300"
                : "bg-slate-900/40 border border-slate-800/80 hover:border-slate-700/80"
            }`}
          >
            {seg.speaker && (
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`text-xs font-extrabold uppercase tracking-wider px-2 py-0.5 rounded ${
                    isHighContrast
                      ? "bg-yellow-300 text-black"
                      : isLight
                      ? "bg-indigo-100 text-indigo-800 border border-indigo-200"
                      : "bg-indigo-950/80 text-indigo-400 border border-indigo-800/40"
                  }`}
                >
                  {seg.speaker}
                </span>
                <span className={`text-xs font-mono ${isHighContrast ? "text-yellow-300/80" : isLight ? "text-slate-500" : "opacity-50"}`}>
                  {new Date(seg.timestamp_iso).toLocaleTimeString()}
                </span>
              </div>
            )}
            <p
              className={`${fontSizeClasses} tracking-normal ${
                isHighContrast
                  ? "text-yellow-300 font-semibold"
                  : isLight
                  ? "text-slate-900 font-medium"
                  : "text-slate-100"
              } break-words [overflow-wrap:anywhere]`}
            >
              {seg.text}
            </p>
          </article>
        ))}

        {/* Live Active Partial Stream Segment */}
        {activePartial && activePartial.text.trim() && (
          <article
            className={`p-4 sm:p-5 rounded-2xl transition-all border-l-4 caption-enter ${
              isHighContrast
                ? "border-yellow-300 bg-yellow-950/30 text-yellow-300"
                : isLight
                ? "border-indigo-600 bg-indigo-50/70 text-indigo-950 shadow-sm"
                : "border-indigo-500 bg-indigo-950/20 text-indigo-100"
            }`}
          >
            {activePartial.speaker && (
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                    isHighContrast ? "text-yellow-300" : isLight ? "text-indigo-900 font-extrabold" : "text-amber-400"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full animate-ping ${
                      isHighContrast ? "bg-yellow-300" : isLight ? "bg-indigo-600" : "bg-amber-400"
                    }`}
                  />
                  {activePartial.speaker}
                </span>
              </div>
            )}
            <p
              className={`${fontSizeClasses} font-normal tracking-wide break-words [overflow-wrap:anywhere] ${
                isHighContrast
                  ? "text-yellow-300"
                  : isLight
                  ? "text-indigo-950 font-medium"
                  : "text-indigo-100"
              }`}
            >
              {activePartial.text}
              <span
                className={`inline-block w-2.5 h-6 ml-2 cursor-pulse rounded-sm align-middle ${
                  isHighContrast
                    ? "bg-yellow-300 shadow-[0_0_8px_#FFFF00]"
                    : isLight
                    ? "bg-indigo-700"
                    : "bg-indigo-400"
                }`}
                aria-hidden="true"
              />
            </p>
          </article>
        )}

        <div ref={scrollBottomAnchorRef} className="h-4" />
      </main>

      {/* Floating Resume Auto-Scroll Button */}
      <aside
        className={`fixed bottom-6 right-4 sm:right-6 z-30 transition-all duration-300 ease-out transform ${
          userScrolledUp
            ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
            : "opacity-0 translate-y-4 scale-95 pointer-events-none"
        }`}
      >
        <button
          onClick={resumeScroll}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-xs sm:text-sm shadow-2xl transition-all hover:scale-105 active:scale-95 ${
            isHighContrast
              ? "bg-yellow-300 text-black border-2 border-yellow-300 font-extrabold shadow-yellow-300/40"
              : isLight
              ? "bg-indigo-700 hover:bg-indigo-800 text-white shadow-indigo-600/40 border border-indigo-600"
              : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/50 border border-indigo-400/30"
          }`}
          aria-label="Scroll pausado (hacé clic para volver al vivo)"
        >
          <span className="flex h-2 w-2 relative">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isHighContrast ? "bg-black" : "bg-white"
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                isHighContrast ? "bg-black" : isLight ? "bg-emerald-300" : "bg-emerald-400"
              }`}
            />
          </span>
          <ArrowDown className="w-4 h-4 animate-bounce" />
          <span className="hidden sm:inline">Scroll pausado (hacé clic para volver al vivo)</span>
          <span className="sm:hidden">Volver al vivo</span>
        </button>
      </aside>
    </div>
  );
};
