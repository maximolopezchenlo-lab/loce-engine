import React, { useState, useEffect, useCallback } from "react";
import { AudienceView } from "./components/AudienceView";
import { ObsOverlay } from "./components/ObsOverlay";
import { AdminDashboard } from "./components/AdminDashboard";
import { SettingsModal } from "./components/SettingsModal";
import { RoomSummary } from "./types";
import { getConfig, getApiUrl } from "./utils/config";

export function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isOnboarding, setIsOnboarding] = useState(false);

  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const fetchRooms = useCallback(() => {
    fetch(getApiUrl("/api/rooms"))
      .then((res) => res.json())
      .then((data) => {
        if (data.rooms) setRooms(data.rooms);
      })
      .catch((err) => console.error("Could not fetch rooms:", err));
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  // Check onboarding status on initial load (only for main web views, not OBS overlays)
  useEffect(() => {
    if (!window.location.pathname.startsWith("/overlay")) {
      const cfg = getConfig();
      if (!cfg.hasOnboarded) {
        setIsOnboarding(true);
        setIsSettingsOpen(true);
      }
    }
  }, []);

  const openSettings = useCallback(() => {
    setIsOnboarding(false);
    setIsSettingsOpen(true);
  }, []);

  // 1. OBS Overlay Route: /overlay/:roomId
  if (currentPath.startsWith("/overlay")) {
    const parts = currentPath.split("/").filter(Boolean);
    const roomId = parts[1] || "main-stage";

    const params = new URLSearchParams(window.location.search);
    const lang = params.get("lang") || "es";
    const maxLines = parseInt(params.get("lines") || "2", 10);
    const fontSize = (params.get("size") as "md" | "lg" | "xl" | "2xl") || "xl";

    return (
      <ObsOverlay
        roomId={roomId}
        lang={lang}
        maxLines={maxLines}
        fontSize={fontSize}
        showSpeaker={params.get("speaker") !== "false"}
      />
    );
  }

  // 2. Admin Dashboard Route: /admin
  if (currentPath === "/admin") {
    return (
      <div>
        <nav className="bg-slate-900 border-b border-slate-800 px-6 py-2 flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-300">LOCE Control Plane</span>
          <div className="flex items-center gap-4">
            <button
              onClick={openSettings}
              className="text-slate-400 hover:text-white transition-colors"
            >
              Configuración
            </button>
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                window.history.pushState({}, "", "/");
                setCurrentPath("/");
              }}
              className="text-indigo-400 hover:text-indigo-300 font-medium"
            >
              &larr; Back to Audience View
            </a>
          </div>
        </nav>
        <AdminDashboard onOpenSettings={openSettings} />

        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          isOnboarding={isOnboarding}
          onSaved={fetchRooms}
        />
      </div>
    );
  }

  // 3. Audience View (Default)
  const searchParams = new URLSearchParams(window.location.search);
  const initialRoomId = searchParams.get("room") || "main-stage";
  const initialLang = searchParams.get("lang") || "es";

  return (
    <div>
      <AudienceView
        initialRoomId={initialRoomId}
        initialLang={initialLang}
        availableRooms={rooms}
        onOpenSettings={openSettings}
      />

      {/* Quick link to admin dashboard in footer */}
      <footer className="py-4 text-center text-xs text-slate-600 bg-slate-950 border-t border-slate-900">
        <a
          href="/admin"
          onClick={(e) => {
            e.preventDefault();
            window.history.pushState({}, "", "/admin");
            setCurrentPath("/admin");
          }}
          className="hover:text-slate-400 underline underline-offset-4"
        >
          Open Admin & Monitoring Dashboard &rarr;
        </a>
      </footer>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isOnboarding={isOnboarding}
        onSaved={fetchRooms}
      />
    </div>
  );
}

export default App;
