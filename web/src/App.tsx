import React, { useState, useEffect } from "react";
import { AudienceView } from "./components/AudienceView";
import { ObsOverlay } from "./components/ObsOverlay";
import { AdminDashboard } from "./components/AdminDashboard";
import { RoomSummary } from "./types";

export function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);

  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    fetch("/api/rooms")
      .then((res) => res.json())
      .then((data) => {
        if (data.rooms) setRooms(data.rooms);
      })
      .catch((err) => console.error("Could not fetch rooms:", err));
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
        </nav>
        <AdminDashboard />
      </div>
    );
  }

  // 3. Audience View (Default)
  return (
    <div>
      <AudienceView initialRoomId="main-stage" availableRooms={rooms} />
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
    </div>
  );
}

export default App;
