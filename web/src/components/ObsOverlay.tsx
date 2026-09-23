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
    const root = document.getElementById("root");
    if (root) root.classList.add("obs-mode");

    return () => {
      document.documentElement.classList.remove("obs-mode");
      document.body.classList.remove("obs-mode");
      if (root) root.classList.remove("obs-mode");
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
    md: "text-2xl leading-snug",
    lg: "text-3xl leading-relaxed",
    xl: "text-4xl leading-tight font-semibold tracking-wide",
    "2xl": "text-5xl leading-tight font-bold tracking-wide",
  }[fontSize];

  return (
    <div
      className="fixed inset-0 w-screen h-screen flex flex-col justify-end p-8 pb-12 pointer-events-none select-none bg-transparent"
      style={{ backgroundColor: "transparent" }}
    >
      <div className="max-w-5xl mx-auto w-full flex flex-col gap-3">
        {displayLines.map((line) => (
          <div
            key={line.id}
            className="caption-enter flex items-baseline gap-3"
          >
            {/* Subtle frosted backdrop for broadcast readability without solid box */}
            <div className="inline-block px-4 py-2 rounded-lg bg-black/40 backdrop-blur-[2px]">
              {showSpeaker && line.speaker && (
                <span className="text-amber-400 font-bold uppercase tracking-wider text-sm mr-3 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                  {line.speaker}
                </span>
              )}
              <span
                className={`broadcast-text text-white ${sizeClass} ${
                  line.isPartial ? "text-indigo-200" : "text-white"
                }`}
              >
                {line.text}
                {line.isPartial && (
                  <span className="inline-block w-2.5 h-6 ml-1.5 bg-amber-400/90 animate-pulse rounded-sm align-middle" />
                )}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
