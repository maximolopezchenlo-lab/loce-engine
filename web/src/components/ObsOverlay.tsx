import React, { useEffect, useMemo } from "react";
import { useCaptionStream } from "../hooks/useCaptionStream";

interface ObsOverlayProps {
  roomId: string;
  lang?: string;
  maxLines?: number;
  fontSize?: "md" | "lg" | "xl" | "2xl";
  showSpeaker?: boolean;
}

export const ObsOverlay: React.FC<ObsOverlayProps> = ({
  roomId,
  lang = "es",
  maxLines = 2,
  fontSize = "xl",
  showSpeaker = true,
}) => {
  const { history, activePartial } = useCaptionStream({
    roomId,
    lang,
    mode: "all",
  });

  // Apply transparent background to html/body/root for OBS Browser Source
  useEffect(() => {
    document.documentElement.classList.add("obs-mode");
    document.body.classList.add("obs-mode");
    document.documentElement.style.setProperty("background-color", "transparent", "important");
    document.documentElement.style.setProperty("background", "transparent", "important");
    document.body.style.setProperty("background-color", "transparent", "important");
    document.body.style.setProperty("background", "transparent", "important");

    const root = document.getElementById("root");
    if (root) {
      root.classList.add("obs-mode");
      root.style.setProperty("background-color", "transparent", "important");
      root.style.setProperty("background", "transparent", "important");
    }

    return () => {
      document.documentElement.classList.remove("obs-mode");
      document.body.classList.remove("obs-mode");
      document.documentElement.style.removeProperty("background-color");
      document.documentElement.style.removeProperty("background");
      document.body.style.removeProperty("background-color");
      document.body.style.removeProperty("background");
      if (root) {
        root.classList.remove("obs-mode");
        root.style.removeProperty("background-color");
        root.style.removeProperty("background");
      }
    };
  }, []);

  // Compute the visible lines: taking latest finalized lines plus active partial
  const displayLines = useMemo(() => {
    const lines: Array<{
      id: string;
      text: string;
      speaker?: string | null;
      isPartial: boolean;
    }> = [];

    // Slice recent finals
    const sliceCount = activePartial ? Math.max(0, maxLines - 1) : maxLines;
    const recentFinals = history.slice(-sliceCount);

    for (const item of recentFinals) {
      lines.push({
        id: item.id,
        text: item.text,
        speaker: item.speaker,
        isPartial: false,
      });
    }

    if (activePartial && activePartial.text.trim()) {
      lines.push({
        id: activePartial.id,
        text: activePartial.text,
        speaker: activePartial.speaker,
        isPartial: true,
      });
    }

    return lines.slice(-maxLines);
  }, [history, activePartial, maxLines]);

  const sizeClass = {
    md: "text-2xl leading-normal",
    lg: "text-3xl leading-snug font-medium",
    xl: "text-4xl leading-[1.35] font-semibold tracking-wide",
    "2xl": "text-5xl leading-[1.3] font-bold tracking-wide",
  }[fontSize];

  return (
    <div
      className="fixed inset-0 w-screen h-screen flex flex-col justify-end p-6 md:p-10 pb-8 md:pb-12 pointer-events-none select-none bg-transparent overflow-hidden"
      style={{ backgroundColor: "transparent", border: "none", boxShadow: "none" }}
    >
      <div className="max-w-6xl mx-auto w-full flex flex-col gap-3 overflow-hidden bg-transparent">
        {displayLines.map((line) => (
          <div
            key={line.isPartial ? "active-partial-stream" : line.id}
            className={`flex items-baseline gap-3 max-w-full ${!line.isPartial ? "caption-enter" : ""}`}
          >
            {/* Subtle frosted backdrop for broadcast readability without solid box or parasitic outline */}
            <div
              className={`inline-flex flex-wrap items-baseline px-5 py-2.5 rounded-xl bg-black/65 backdrop-blur-[3px] shadow-[0_4px_16px_rgba(0,0,0,0.5)] transition-all duration-150 ${
                line.isPartial ? "ring-1 ring-amber-400/40" : ""
              }`}
            >
              {showSpeaker && line.speaker && (
                <span className="text-amber-300 font-extrabold uppercase tracking-wider text-xs md:text-sm mr-3 select-none drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
                  {line.speaker}
                </span>
              )}
              <span
                className={`broadcast-text ${sizeClass} ${
                  line.isPartial ? "text-amber-100/95 font-medium" : "text-white font-semibold"
                }`}
              >
                {line.text}
                {line.isPartial && (
                  <span
                    className="inline-block w-2.5 h-6 ml-2 bg-amber-400 cursor-pulse rounded-[1px] align-middle shadow-[0_0_10px_rgba(251,191,36,0.9)]"
                    aria-hidden="true"
                  />
                )}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
