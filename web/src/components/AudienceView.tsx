import React, { useState, useRef, useEffect } from "react";
import {
  Globe,
  Radio,
  Type,
  Eye,
  ArrowDown,
  Download,
  Wifi,
  WifiOff,
  Clock,
  Sparkles,
  Layers,
} from "lucide-react";
import { useCaptionStream } from "../hooks/useCaptionStream";
import { RoomSummary } from "../types";

interface AudienceViewProps {
  initialRoomId?: string;
  availableRooms?: RoomSummary[];
}

export const AudienceView: React.FC<AudienceViewProps> = ({
  initialRoomId = "main-stage",
  availableRooms = [],
}) => {
  const [roomId, setRoomId] = useState(initialRoomId);
  const [lang, setLang] = useState<string>("es");
  const [fontSize, setFontSize] = useState<"sm" | "md" | "lg" | "xl">("lg");
  const [highContrast, setHighContrast] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollBottomAnchorRef = useRef<HTMLDivElement>(null);

  const { history, activePartial, connectionState, latencyMs } = useCaptionStream({
    roomId,
    lang,
    mode: "all",
  });

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

  const fontSizeClasses = {
    sm: "text-lg leading-relaxed",
    md: "text-xl leading-relaxed",
    lg: "text-2xl leading-loose",
    xl: "text-3xl leading-loose font-medium",
  }[fontSize];

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-200 ${
        highContrast
          ? "bg-black text-yellow-300"
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
        className={`sticky top-0 z-20 border-b backdrop-blur-md px-4 py-3 transition-colors ${
          highContrast
            ? "bg-black/95 border-yellow-300"
            : "bg-slate-900/80 border-slate-800"
        }`}
      >
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Brand & Room Selector */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30">
                <Radio className="w-5 h-5 animate-pulse" />
              </span>
              <div>
                <h1 className="text-lg font-bold tracking-tight">LiveVoice LOCE</h1>
                <p className="text-xs opacity-70">Simultaneous Live Transcription</p>
              </div>
            </div>

            <div className="h-6 w-px bg-slate-800 hidden sm:block" />

            {/* Room Selector */}
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 opacity-70" />
              <select
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium border transition-colors outline-none focus:ring-2 focus:ring-indigo-500 ${
                  highContrast
                    ? "bg-black text-yellow-300 border-yellow-300"
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
          </div>

          {/* Controls: Language, Font, Contrast, Downloads */}
          <div className="flex items-center flex-wrap gap-2">
            {/* Language Selector */}
            <div className="flex items-center flex-wrap gap-1 rounded-lg p-1 bg-slate-800/50 border border-slate-700/60">
              {[
                { code: "es", label: "ES", title: "Español" },
                { code: "en", label: "EN", title: "English" },
                { code: "pt", label: "PT", title: "Português" },
                { code: "fr", label: "FR", title: "Français" },
                { code: "de", label: "DE", title: "Deutsch" },
                { code: "it", label: "IT", title: "Italiano" },
                { code: "ru", label: "RU", title: "Русский" },
                { code: "zh", label: "ZH", title: "中文" },
              ].map((item) => (
                <button
                  key={item.code}
                  onClick={() => setLang(item.code)}
                  title={item.title}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                    lang === item.code
                      ? "bg-indigo-600 text-white shadow"
                      : "opacity-70 hover:opacity-100 text-slate-300"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Font Sizing */}
            <div className="flex items-center gap-1 rounded-lg p-1 bg-slate-800/50 border border-slate-700/60">
              {(["sm", "md", "lg", "xl"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFontSize(s)}
                  className={`w-7 h-7 text-xs font-bold rounded flex items-center justify-center transition-all ${
                    fontSize === s
                      ? "bg-indigo-600 text-white"
                      : "opacity-70 hover:opacity-100"
                  }`}
                  title={`Font Size: ${s.toUpperCase()}`}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>

            {/* High Contrast Toggle */}
            <button
              onClick={() => setHighContrast(!highContrast)}
              className={`p-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-all ${
                highContrast
                  ? "bg-yellow-300 text-black border-yellow-300 font-bold"
                  : "bg-slate-800/50 border-slate-700/60 text-slate-300 hover:text-white"
              }`}
              title="Toggle High Contrast Mode (WCAG AAA)"
              aria-label="High Contrast Mode"
            >
              <Eye className="w-4 h-4" />
              <span className="hidden md:inline">Contrast</span>
            </button>

            {/* Download Transcripts */}
            <div className="flex items-center gap-1">
              <a
                href={`/api/rooms/${roomId}/export/srt?lang=${lang}`}
                download
                className="px-2.5 py-1.5 rounded-lg border border-slate-700/60 bg-slate-800/50 hover:bg-slate-800 text-xs font-medium flex items-center gap-1 transition-all"
                title="Download SRT Subtitles"
              >
                <Download className="w-3.5 h-3.5" />
                <span>SRT</span>
              </a>
              <a
                href={`/api/rooms/${roomId}/export/vtt?lang=${lang}`}
                download
                className="px-2.5 py-1.5 rounded-lg border border-slate-700/60 bg-slate-800/50 hover:bg-slate-800 text-xs font-medium flex items-center gap-1 transition-all"
                title="Download WebVTT Subtitles"
              >
                <Download className="w-3.5 h-3.5" />
                <span>VTT</span>
              </a>
            </div>

            {/* Connection & Latency Badge */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
                connectionState === "connected"
                  ? "bg-emerald-950/40 text-emerald-400 border-emerald-800/60"
                  : "bg-rose-950/40 text-rose-400 border-rose-800/60"
              }`}
            >
              {connectionState === "connected" ? (
                <>
                  <Wifi className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
                  <span className="hidden lg:inline">{latencyMs > 0 ? `${latencyMs}ms` : "Live"}</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                  <span>Connecting</span>
                </>
              )}
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
          <div className="flex-1 flex flex-col items-center justify-center text-center py-24 opacity-60">
            <Radio className="w-12 h-12 mb-4 text-indigo-400 animate-pulse" />
            <h3 className="text-xl font-semibold mb-1">Awaiting Speaker Audio...</h3>
            <p className="text-sm max-w-md">
              Audio stream is active in <span className="font-mono text-indigo-400">{roomId}</span>.
              Captions and translations will stream in real-time as speech is detected.
            </p>
          </div>
        )}

        {/* Finalized Transcript Segments */}
        {history.map((seg) => (
          <article
            key={seg.id}
            className={`p-4 rounded-2xl transition-all ${
              highContrast
                ? "border-2 border-yellow-300 bg-black"
                : "bg-slate-900/40 border border-slate-800/80 hover:border-slate-700/80"
            }`}
          >
            {seg.speaker && (
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                    highContrast
                      ? "bg-yellow-300 text-black font-extrabold"
                      : "bg-indigo-950/80 text-indigo-400 border border-indigo-800/40"
                  }`}
                >
                  {seg.speaker}
                </span>
                <span className="text-xs opacity-50 font-mono">
                  {new Date(seg.timestamp_iso).toLocaleTimeString()}
                </span>
              </div>
            )}
            <p className={`${fontSizeClasses} tracking-normal text-slate-100`}>
              {seg.text}
            </p>
          </article>
        ))}

        {/* Live Active Partial Stream Segment */}
        {activePartial && activePartial.text.trim() && (
          <article
            className={`p-5 rounded-2xl transition-all border-l-4 caption-enter ${
              highContrast
                ? "border-yellow-300 bg-yellow-950/20 text-yellow-200"
                : "border-indigo-500 bg-indigo-950/20 text-indigo-100"
            }`}
          >
            {activePartial.speaker && (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  {activePartial.speaker}
                </span>
              </div>
            )}
            <p className={`${fontSizeClasses} font-normal tracking-wide`}>
              {activePartial.text}
              <span className="inline-block w-2.5 h-6 ml-2 bg-indigo-500 animate-pulse rounded-sm align-middle" />
            </p>
          </article>
        )}

        <div ref={scrollBottomAnchorRef} className="h-4" />
      </main>

      {/* Floating Resume Auto-Scroll Button */}
      {userScrolledUp && (
        <aside className="fixed bottom-6 right-6 z-30">
          <button
            onClick={resumeScroll}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm shadow-xl shadow-indigo-600/40 transition-all hover:scale-105 active:scale-95"
            aria-label="Resume auto-scrolling to latest subtitles"
          >
            <ArrowDown className="w-4 h-4 animate-bounce" />
            <span>Resume Auto-Scroll</span>
          </button>
        </aside>
      )}
    </div>
  );
};
