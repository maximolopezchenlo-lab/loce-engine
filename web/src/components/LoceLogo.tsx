import React from "react";

export interface LoceLogoProps {
  size?: "sm" | "md" | "lg" | "xl" | number;
  showText?: boolean;
  showSubtitle?: boolean;
  className?: string;
  animate?: boolean;
  theme?: "dark" | "light" | "high-contrast";
}

export const LoceLogo: React.FC<LoceLogoProps> = ({
  size = "md",
  showText = true,
  showSubtitle = false,
  className = "",
  animate = false,
  theme = "dark",
}) => {
  const pixelSize =
    typeof size === "number"
      ? size
      : size === "sm"
      ? 28
      : size === "md"
      ? 36
      : size === "lg"
      ? 44
      : 56;

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      {/* Emblem SVG */}
      <div
        className="relative flex-shrink-0 flex items-center justify-center"
        style={{ width: pixelSize, height: pixelSize }}
      >
        <svg
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-md"
        >
          <defs>
            <linearGradient id="loce-brand-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#06B6D4" />
              <stop offset="50%" stopColor="#6366F1" />
              <stop offset="100%" stopColor="#A855F7" />
            </linearGradient>
            <linearGradient id="loce-wave-grad" x1="0%" y1="50%" x2="100%" y2="50%">
              <stop offset="0%" stopColor="#22D3EE" />
              <stop offset="50%" stopColor="#818CF8" />
              <stop offset="100%" stopColor="#C084FC" />
            </linearGradient>
            <filter id="loce-glow-filter" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Squircle Badge Background */}
          <rect
            width="64"
            height="64"
            rx="16"
            className="fill-slate-900/90 dark:fill-[#090D16]"
          />
          <rect
            x="1"
            y="1"
            width="62"
            height="62"
            rx="15"
            stroke="url(#loce-brand-grad)"
            strokeWidth="1.5"
            strokeOpacity="0.45"
          />

          {/* Caption brackets [ ] */}
          <path
            d="M18 16 H14 V48 H18"
            stroke="#06B6D4"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M46 16 H50 V48 H46"
            stroke="#A855F7"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Central Microphone / speech capsule */}
          <rect
            x="26"
            y="18"
            width="12"
            height="18"
            rx="6"
            fill="#131B2E"
            stroke="url(#loce-brand-grad)"
            strokeWidth="2"
          />
          <path
            d="M22 27 C22 34.5 42 34.5 42 27"
            stroke="url(#loce-brand-grad)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M32 35 V43 M26 43 H38"
            stroke="url(#loce-brand-grad)"
            strokeWidth="2"
            strokeLinecap="round"
          />

          {/* Transversal Waveform */}
          <path
            d="M11 32 C17 32 19 22 24 22 C29 22 31 40 36 40 C41 40 43 26 48 26 C51 26 53 32 55 32"
            stroke="url(#loce-wave-grad)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            filter="url(#loce-glow-filter)"
            className={animate ? "animate-pulse" : ""}
          />

          {/* Glowing pulse dot */}
          <circle cx="36" cy="40" r="2.2" fill="#38BDF8" className="animate-ping" style={{ transformOrigin: "36px 40px" }} />
          <circle cx="36" cy="40" r="2" fill="#38BDF8" />
        </svg>
      </div>

      {/* Typography Brand */}
      {showText && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 leading-none">
            <span
              className={`font-extrabold tracking-tight font-mono text-base md:text-lg ${
                theme === "high-contrast"
                  ? "text-yellow-300 drop-shadow-sm"
                  : theme === "light"
                  ? "bg-gradient-to-r from-indigo-800 via-indigo-600 to-purple-700 bg-clip-text text-transparent"
                  : "bg-gradient-to-r from-cyan-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent"
              }`}
            >
              LiveVoice
            </span>
            <span
              className={`text-[10px] font-black px-1.5 py-0.5 rounded tracking-widest uppercase border ${
                theme === "high-contrast"
                  ? "bg-yellow-300 text-black border-yellow-300 font-bold"
                  : theme === "light"
                  ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                  : "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
              }`}
            >
              LOCE
            </span>
          </div>
          {showSubtitle && (
            <span
              className={`text-[10px] font-medium tracking-wider uppercase mt-0.5 ${
                theme === "high-contrast"
                  ? "text-yellow-300/80"
                  : theme === "light"
                  ? "text-slate-600"
                  : "text-slate-400"
              }`}
            >
              Open-Caption Engine
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default LoceLogo;
