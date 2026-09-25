import React, { useState, useEffect, useMemo } from "react";
import {
  Activity,
  Plus,
  Play,
  Square,
  BookOpen,
  Download,
  Users,
  HardDrive,
  Cpu,
  RefreshCw,
  Sliders,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Zap,
  Shield,
  FlaskConical,
  Search,
  Check,
  Sparkles,
  Settings,
} from "lucide-react";
import { RoomSummary } from "../types";
import { LiveAudioBroadcaster } from "./LiveAudioBroadcaster";
import { getApiUrl } from "../utils/config";
import { LoceLogo } from "./LoceLogo";

interface AdminDashboardProps {
  onOpenSettings?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onOpenSettings }) => {

  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"matrix" | "cards">(() =>
    typeof window !== "undefined" && window.innerWidth < 768 ? "cards" : "matrix"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "stopped">("all");
  const [exportFeedback, setExportFeedback] = useState<{ [key: string]: string }>({});
  const [seeding32, setSeeding32] = useState(false);

  // New room form
  const [newRoomId, setNewRoomId] = useState("");
  const [newRoomName, setNewRoomName] = useState("");
  const [newProvider, setNewProvider] = useState("mock");

  // Glossary editor form
  const [glossaryTerms, setGlossaryTerms] = useState("");
  const [glossarySpeakers, setGlossarySpeakers] = useState("");
  const [glossarySuccess, setGlossarySuccess] = useState(false);

  // Fetch rooms list
  const fetchRooms = async () => {
    try {
      setLoading(true);
      const res = await fetch(getApiUrl("/api/rooms"));
      if (res.ok) {
        const data = await res.json();
        setRooms(data.rooms || []);
        if (!selectedRoomId && data.rooms?.length > 0) {
          setSelectedRoomId(data.rooms[0].room_id);
        }
      }
    } catch (e) {
      console.error("Error fetching rooms:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 3000);
    return () => clearInterval(interval);
  }, []);

  // Fetch glossary when selected room changes
  useEffect(() => {
    if (!selectedRoomId) return;
    fetch(getApiUrl(`/api/rooms/${selectedRoomId}/glossary`))
      .then((res) => res.json())
      .then((data) => {
        setGlossaryTerms((data.terms || []).join(", "));
        setGlossarySpeakers((data.speakers || []).join(", "));
      })
      .catch((err) => console.error(err));
  }, [selectedRoomId]);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomId.trim()) return;

    try {
      const res = await fetch(getApiUrl("/api/rooms"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id: newRoomId.trim().toLowerCase().replace(/\s+/g, "-"),
          name: newRoomName.trim() || newRoomId,
          provider_type: newProvider,
        }),
      });
      if (res.ok) {
        setNewRoomId("");
        setNewRoomName("");
        fetchRooms();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveGlossary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoomId) return;

    const termsArray = glossaryTerms
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const speakersArray = glossarySpeakers
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const res = await fetch(getApiUrl(`/api/rooms/${selectedRoomId}/glossary`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          terms: termsArray,
          speakers: speakersArray,
          replacements: {},
        }),
      });
      if (res.ok) {
        setGlossarySuccess(true);
        setTimeout(() => setGlossarySuccess(false), 2500);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleStartStop = async (roomId: string, currentStatus: string) => {
    const action = currentStatus === "active" ? "stop" : "start";
    try {
      await fetch(getApiUrl(`/api/rooms/${roomId}/${action}`), { method: "POST" });
      fetchRooms();
    } catch (err) {
      console.error(err);
    }
  };

  const handleExport = (roomId: string, format: string, lang: string) => {
    const url = getApiUrl(`/api/rooms/${roomId}/export/${format}?lang=${lang}`);
    window.open(url, "_blank");
    setExportFeedback((prev) => ({ ...prev, [roomId]: `${format.toUpperCase()} (${lang.toUpperCase()})` }));
    setTimeout(() => {
      setExportFeedback((prev) => {
        const next = { ...prev };
        delete next[roomId];
        return next;
      });
    }, 2200);
  };

  const handleSeed32Rooms = async () => {
    try {
      setSeeding32(true);
      const stageTemplates = [
        { id: "main-stage", name: "Main Auditorium", provider: "mock" },
        { id: "track-1", name: "Engineering Track", provider: "mock" },
        { id: "track-2", name: "AI & Systems Track", provider: "mock" },
        { id: "stage-alpha", name: "Alpha Stage: Distributed Systems", provider: "gemini" },
        { id: "stage-beta", name: "Beta Stage: Edge AI & Gemma 4", provider: "gemma" },
        { id: "stage-gamma", name: "Gamma Stage: Broadcast Architecture", provider: "mock" },
        { id: "stage-delta", name: "Delta Stage: Security & Sandbox", provider: "gemma" },
        { id: "track-cloud-1", name: "Cloud Engineering Track 1", provider: "gemini" },
        { id: "track-cloud-2", name: "Cloud Engineering Track 2", provider: "gemini" },
        { id: "track-ml-ops", name: "MLOps & GPU Scheduling", provider: "gemma" },
        { id: "track-frontend", name: "Staff Frontend & A11y", provider: "mock" },
        { id: "track-broadcast", name: "Broadcast Design & OBS", provider: "mock" },
        { id: "track-audio-dsp", name: "Audio DSP & WebAudio", provider: "mock" },
        { id: "track-latency", name: "Ultra-Low Latency Networks", provider: "gemini" },
        { id: "workshop-101", name: "Workshop: Gemma 4 Fine-tuning", provider: "gemma" },
        { id: "workshop-102", name: "Workshop: Realtime WebSockets", provider: "mock" },
        { id: "workshop-103", name: "Workshop: Gemini Live Bidi", provider: "gemini" },
        { id: "workshop-104", name: "Workshop: Multilingual Captions", provider: "mock" },
        { id: "workshop-105", name: "Workshop: Audio Ring Buffers", provider: "mock" },
        { id: "workshop-106", name: "Workshop: High Availability NOC", provider: "gemma" },
        { id: "breakout-a", name: "Breakout Room A: Systems", provider: "mock" },
        { id: "breakout-b", name: "Breakout Room B: Architecture", provider: "mock" },
        { id: "breakout-c", name: "Breakout Room C: DevTools", provider: "mock" },
        { id: "breakout-d", name: "Breakout Room D: Accessibility", provider: "mock" },
        { id: "press-conference", name: "Press & Media Briefing", provider: "gemini" },
        { id: "executive-qa", name: "Executive Leadership Q&A", provider: "gemini" },
        { id: "community-hall", name: "Community Open Space", provider: "mock" },
        { id: "expo-hall-1", name: "Expo Demonstration Hall 1", provider: "mock" },
        { id: "expo-hall-2", name: "Expo Demonstration Hall 2", provider: "mock" },
        { id: "lightning-talks", name: "5-Min Lightning Talks", provider: "mock" },
        { id: "hackathon-arena", name: "Hackathon Live Arena", provider: "gemini" },
        { id: "closing-stage", name: "Closing Ceremony & Awards", provider: "gemini" },
      ];

      for (const t of stageTemplates) {
        await fetch(getApiUrl("/api/rooms"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room_id: t.id,
            name: t.name,
            provider_type: t.provider,
          }),
        });
      }
      await fetchRooms();
    } catch (err) {
      console.error("Error seeding rooms:", err);
    } finally {
      setSeeding32(false);
    }
  };

  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      const matchesSearch =
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.room_id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && r.status === "active") ||
        (statusFilter === "stopped" && r.status !== "active");
      return matchesSearch && matchesStatus;
    });
  }, [rooms, searchQuery, statusFilter]);

  const renderHealthBadge = (r: RoomSummary) => {
    const isActive = r.status === "active";
    const isPass15 = isActive && r.p95_latency_ms > 0 && r.p95_latency_ms <= 15;
    const isOptimal50 = isActive && r.p95_latency_ms > 15 && r.p95_latency_ms <= 50;
    const isNormal = isActive && ((r.p95_latency_ms > 50 && r.p95_latency_ms <= 200) || r.p95_latency_ms === 0);
    const isHighLatency = isActive && r.p95_latency_ms > 200;

    if (!isActive) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800/80 text-slate-400 border border-slate-700/60">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
          STOPPED
        </span>
      );
    }
    if (isPass15) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/60 shadow-sm shadow-emerald-950/60">
          <span className="relative flex h-2 w-2 mr-0.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
          </span>
          PASS (&lt;15ms)
        </span>
      );
    }
    if (isOptimal50) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-700/50">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          OPTIMAL (&lt;50ms)
        </span>
      );
    }
    if (isNormal) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-950/60 text-yellow-400 border border-yellow-700/50">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
          NORMAL
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-950/70 text-rose-400 border border-rose-800/60 animate-pulse">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
        HIGH LATENCY
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-slate-800 pb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <LoceLogo size={46} showText={false} animate={true} />
              <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
                  <span className="bg-gradient-to-r from-cyan-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent font-mono tracking-tight">
                    LOCE
                  </span>
                  <span>Production & Orchestration Dashboard</span>
                </h1>
                <p className="text-sm text-slate-400 mt-0.5">
                  Multi-room audio ingestion, Gemini Live cloud, and on-premise Gemma 4 inference monitoring.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onOpenSettings && (
                <button
                  onClick={onOpenSettings}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-950/60 border border-indigo-700/60 hover:bg-indigo-900/60 text-indigo-300 text-sm font-medium transition-all shadow-sm"
                  title="Configurar motor de IA y URL de backend"
                >
                  <Settings className="w-4 h-4 text-indigo-400" />
                  <span>Configuración</span>
                </button>
              )}
              <button
                onClick={fetchRooms}
                disabled={loading}
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-sm font-medium transition-all"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* Active Inference Engine Telemetry & Selector Badges */}
          <div className="flex flex-wrap items-center gap-3 pt-2 text-xs">
            <span className="text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
              Inferencia Activa:
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold bg-cyan-950/60 text-cyan-300 border border-cyan-800/50 shadow-sm">
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                ⚡ Gemini Live Cloud ({rooms.filter((r) => r.provider_type === "gemini").length})
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold bg-purple-950/60 text-purple-300 border border-purple-800/50 shadow-sm">
                <Shield className="w-3.5 h-3.5 text-purple-400" />
                🔒 Gemma 4 Edge ({rooms.filter((r) => r.provider_type === "gemma").length})
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold bg-amber-950/60 text-amber-300 border border-amber-800/50 shadow-sm">
                <FlaskConical className="w-3.5 h-3.5 text-amber-400" />
                🧪 Mock Simulator ({rooms.filter((r) => r.provider_type === "mock").length})
              </span>
            </div>
          </div>
        </div>


        {/* Live Audio Broadcaster Panel (Microphone & Audio File Ingest) */}
        <section>
          <LiveAudioBroadcaster
            rooms={rooms}
            selectedRoomId={selectedRoomId}
            onRoomSelect={(id) => setSelectedRoomId(id)}
          />
        </section>

        {/* Multi-Room Monitoring Grid & High-Density Matrix */}
        <section className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Cpu className="w-5 h-5 text-indigo-400" />
                Salas y Pistas de Conferencia ({filteredRooms.length}/{rooms.length})
              </h2>
              {rooms.length >= 8 && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-indigo-950/80 text-indigo-300 border border-indigo-800/50">
                  Alta Densidad ({rooms.length} Salas)
                </span>
              )}
            </div>

            {/* View Mode Switcher & Quick 32-Room Seed Button */}
            <div className="flex items-center flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSeed32Rooms}
                disabled={seeding32}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-300 hover:text-white text-xs font-semibold transition-all shadow-sm active:scale-95 disabled:opacity-50"
                title="Generar matriz de 32 salas de conferencia para simulación NOC"
              >
                <Sparkles className={`w-3.5 h-3.5 text-indigo-400 ${seeding32 ? "animate-spin" : ""}`} />
                <span>{seeding32 ? "Generando 32 Salas..." : "Cargar Matriz 32 Salas"}</span>
              </button>

              <div className="flex items-center rounded-xl p-1 bg-slate-900 border border-slate-800 text-xs">
                <button
                  onClick={() => setViewMode("matrix")}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    viewMode === "matrix"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Matriz NOC (Alta Densidad)
                </button>
                <button
                  onClick={() => setViewMode("cards")}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    viewMode === "cards"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Cuadrícula de Tarjetas
                </button>
              </div>
            </div>
          </div>

          {/* Search, Filter & Quick-Stats Bar for Up to 32 Rooms */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Buscar sala por nombre o ID (ej. main-stage, track-1)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700/80 text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500 text-xs"
              />
            </div>

            {/* Status Filter Buttons */}
            <div className="flex items-center gap-1.5 self-end sm:self-auto">
              <span className="text-slate-500 font-medium mr-1 hidden lg:inline">Estado:</span>
              <button
                onClick={() => setStatusFilter("all")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  statusFilter === "all"
                    ? "bg-indigo-600 text-white shadow"
                    : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
                }`}
              >
                Todas ({rooms.length})
              </button>
              <button
                onClick={() => setStatusFilter("active")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  statusFilter === "active"
                    ? "bg-emerald-600 text-white shadow"
                    : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
                }`}
              >
                Activas ({rooms.filter((r) => r.status === "active").length})
              </button>
              <button
                onClick={() => setStatusFilter("stopped")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  statusFilter === "stopped"
                    ? "bg-slate-700 text-white shadow"
                    : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
                }`}
              >
                Detenidas ({rooms.filter((r) => r.status !== "active").length})
              </button>
            </div>
          </div>

          {filteredRooms.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-slate-800 bg-slate-900/30 text-slate-400">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-500" />
              <p className="font-semibold">No se encontraron salas</p>
              <p className="text-xs text-slate-500 mt-1">
                Ninguna sala coincide con &ldquo;{searchQuery}&rdquo; en el filtro seleccionado.
              </p>
            </div>
          ) : viewMode === "matrix" ? (
            /* High-Density Matrix View */
            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/40">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Stage / Sala</th>
                    <th className="py-3 px-4">Motor AI</th>
                    <th className="py-3 px-4">Health Status</th>
                    <th className="py-3 px-4">Avg / P95 Latencia</th>
                    <th className="py-3 px-4">Chunks Audio</th>
                    <th className="py-3 px-4">Subtítulos (Final/Parcial)</th>
                    <th className="py-3 px-4">Oyentes</th>
                    <th className="py-3 px-4">OBS Overlays</th>
                    <th className="py-3 px-4">Exportación</th>
                    <th className="py-3 px-4 text-right">Control</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {filteredRooms.map((r) => {
                    const isActive = r.status === "active";
                    const isOptimal = isActive && r.p95_latency_ms > 0 && r.p95_latency_ms <= 50;
                    const isNormal = isActive && ((r.p95_latency_ms > 50 && r.p95_latency_ms <= 200) || r.p95_latency_ms === 0);

                    return (
                      <tr
                        key={r.room_id}
                        onClick={() => setSelectedRoomId(r.room_id)}
                        className={`hover:bg-slate-800/40 transition-colors cursor-pointer ${
                          selectedRoomId === r.room_id ? "bg-indigo-950/20" : ""
                        }`}
                      >
                        {/* Room Info */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-100">{r.name}</div>
                          <span className="font-mono text-slate-500 text-[11px]">{r.room_id}</span>
                        </td>

                        {/* Engine Provider Badge */}
                        <td className="py-3 px-4">
                          {r.provider_type === "gemma" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-800/60 shadow-sm">
                              <Shield className="w-2.5 h-2.5 text-purple-400" />
                              Gemma 4 Edge
                            </span>
                          ) : r.provider_type === "gemini" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 shadow-sm">
                              <Zap className="w-2.5 h-2.5 text-cyan-400" />
                              Gemini Live
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800/60 shadow-sm">
                              <FlaskConical className="w-2.5 h-2.5 text-amber-400" />
                              Mock
                            </span>
                          )}
                        </td>

                        {/* Traffic-Light Health Indicator Badge */}
                        <td className="py-3 px-4">
                          {renderHealthBadge(r)}
                        </td>

                        {/* Latency */}
                        <td className="py-3 px-4 font-mono">
                          <span className={isOptimal ? "text-emerald-400 font-bold" : isNormal ? "text-yellow-400" : "text-slate-300"}>
                            {r.avg_latency_ms} ms
                          </span>
                          <span className="text-slate-500 mx-1">/</span>
                          <span className="text-slate-400">{r.p95_latency_ms} ms</span>
                        </td>

                        {/* Audio Chunks */}
                        <td className="py-3 px-4 font-mono text-slate-300">
                          {r.total_chunks} <span className="text-slate-500 text-[11px]">({Math.round(r.total_bytes / 1024)} KB)</span>
                        </td>

                        {/* Captions Generated */}
                        <td className="py-3 px-4 font-mono">
                          <span className="text-emerald-400 font-bold">{r.final_captions}</span>
                          <span className="text-slate-500 mx-1">finals</span>
                          <span className="text-slate-400 text-[11px]">({r.partial_captions} pts)</span>
                        </td>

                        {/* Viewers */}
                        <td className="py-3 px-4 font-mono text-indigo-400 font-bold">
                          {r.subscribers}
                        </td>

                        {/* OBS Overlays */}
                        <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center flex-wrap gap-1 max-w-[130px]">
                            {["es", "en", "pt", "fr", "de", "it", "ru", "zh"].map((l) => (
                              <a
                                key={l}
                                href={`/overlay/${r.room_id}?lang=${l}`}
                                target="_blank"
                                rel="noreferrer"
                                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-semibold uppercase transition-colors"
                                title={`OBS Overlay (${l.toUpperCase()})`}
                              >
                                {l}
                              </a>
                            ))}
                          </div>
                        </td>

                        {/* Exports with Feedback */}
                        <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5">
                            {exportFeedback[r.room_id] ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-700/60 animate-pulse">
                                <Check className="w-3 h-3" /> {exportFeedback[r.room_id]}
                              </span>
                            ) : (
                              <>
                                <select
                                  onChange={(e) => {
                                    if (e.target.value) {
                                      handleExport(r.room_id, "srt", e.target.value);
                                      e.target.value = "";
                                    }
                                  }}
                                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-[10px] font-semibold border border-slate-700 outline-none cursor-pointer transition-colors"
                                  defaultValue=""
                                  aria-label="Descargar SRT"
                                >
                                  <option value="" disabled>SRT ▼</option>
                                  {["es", "en", "pt", "fr", "de", "it", "ru", "zh"].map((l) => (
                                    <option key={l} value={l}>
                                      {l.toUpperCase()} (.srt)
                                    </option>
                                  ))}
                                </select>
                                <select
                                  onChange={(e) => {
                                    if (e.target.value) {
                                      handleExport(r.room_id, "vtt", e.target.value);
                                      e.target.value = "";
                                    }
                                  }}
                                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-[10px] font-semibold border border-slate-700 outline-none cursor-pointer transition-colors"
                                  defaultValue=""
                                  aria-label="Descargar VTT"
                                >
                                  <option value="" disabled>VTT ▼</option>
                                  {["es", "en", "pt", "fr", "de", "it", "ru", "zh"].map((l) => (
                                    <option key={l} value={l}>
                                      {l.toUpperCase()} (.vtt)
                                    </option>
                                  ))}
                                </select>
                              </>
                            )}
                          </div>
                        </td>

                        {/* Control Start/Stop */}
                        <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleStartStop(r.room_id, r.status)}
                            className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all active:scale-95 ${
                              isActive
                                ? "bg-rose-950/60 text-rose-300 border border-rose-800/60 hover:bg-rose-900"
                                : "bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 hover:bg-emerald-900"
                            }`}
                          >
                            {isActive ? "Stop" : "Start"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Card Grid View (Responsive up to 32 rooms) */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredRooms.map((r) => {
                const isActive = r.status === "active";
                const isSelected = selectedRoomId === r.room_id;

                return (
                  <div
                    key={r.room_id}
                    onClick={() => setSelectedRoomId(r.room_id)}
                    className={`flex flex-col justify-between p-5 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-slate-900/90 border-indigo-500 shadow-xl shadow-indigo-500/10"
                        : "bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60"
                    }`}
                  >
                    <div>
                      {/* Card Top: Title, Engine, Health Badge */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="font-bold text-sm text-white truncate" title={r.name}>
                              {r.name}
                            </h3>
                            {r.provider_type === "gemma" ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-800/60">
                                <Shield className="w-2.5 h-2.5 text-purple-400" />
                                Gemma 4 Edge
                              </span>
                            ) : r.provider_type === "gemini" ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-800/60">
                                <Zap className="w-2.5 h-2.5 text-cyan-400" />
                                Gemini
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800/60">
                                <FlaskConical className="w-2.5 h-2.5 text-amber-400" />
                                Mock
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-[11px] text-slate-400 block mt-0.5 truncate">
                            {r.room_id}
                          </span>
                        </div>

                        <div>
                          {renderHealthBadge(r)}
                        </div>
                      </div>

                      {/* Card Metrics Grid */}
                      <div className="grid grid-cols-2 gap-2.5 py-2.5 border-y border-slate-800/80 my-3 text-xs">
                        <div>
                          <span className="text-slate-400 text-[11px] block">Avg Latency</span>
                          <span className="font-mono font-semibold text-emerald-400 text-sm">
                            {r.avg_latency_ms} ms
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[11px] block">P95 Latency</span>
                          <span className="font-mono font-semibold text-slate-200 text-sm">
                            {r.p95_latency_ms} ms
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[11px] block">Audio Chunks</span>
                          <span className="font-mono font-semibold text-slate-200">
                            {r.total_chunks}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[11px] block">Oyentes / Subs</span>
                          <span className="font-mono font-semibold text-indigo-400 flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {r.subscribers}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Card Actions Footer */}
                    <div className="space-y-2 pt-1">
                      {exportFeedback[r.room_id] && (
                        <div className="text-center py-1 rounded bg-emerald-950/80 border border-emerald-700/60 text-[10px] font-bold text-emerald-400 animate-pulse">
                          ✓ Descargando {exportFeedback[r.room_id]}
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartStop(r.room_id, r.status);
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 ${
                              isActive
                                ? "bg-rose-950/60 text-rose-300 border border-rose-800/60 hover:bg-rose-900/60"
                                : "bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 hover:bg-emerald-900/60"
                            }`}
                          >
                            {isActive ? (
                              <>
                                <Square className="w-3 h-3 fill-rose-300" /> Stop
                              </>
                            ) : (
                              <>
                                <Play className="w-3 h-3 fill-emerald-300" /> Start
                              </>
                            )}
                          </button>

                          <div className="flex items-center gap-1">
                            <select
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                if (e.target.value) {
                                  window.open(e.target.value, "_blank");
                                  e.target.value = "";
                                }
                              }}
                              className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold border border-slate-700 outline-none cursor-pointer"
                              defaultValue=""
                              aria-label="Abrir OBS Overlay"
                            >
                              <option value="" disabled>OBS ▼</option>
                              {["es", "en", "pt", "fr", "de", "it", "ru", "zh"].map((l) => (
                                <option key={l} value={`/overlay/${r.room_id}?lang=${l}`}>
                                  {l.toUpperCase()} Overlay
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <select
                            onChange={(e) => {
                              if (e.target.value) {
                                handleExport(r.room_id, "srt", e.target.value);
                                e.target.value = "";
                              }
                            }}
                            className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold border border-slate-700 outline-none cursor-pointer"
                            defaultValue=""
                            aria-label="Descargar SRT"
                          >
                            <option value="" disabled>SRT ▼</option>
                            {["es", "en", "pt", "fr", "de", "it", "ru", "zh"].map((l) => (
                              <option key={l} value={l}>
                                {l.toUpperCase()} (.srt)
                              </option>
                            ))}
                          </select>

                          <select
                            onChange={(e) => {
                              if (e.target.value) {
                                handleExport(r.room_id, "vtt", e.target.value);
                                e.target.value = "";
                              }
                            }}
                            className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold border border-slate-700 outline-none cursor-pointer"
                            defaultValue=""
                            aria-label="Descargar VTT"
                          >
                            <option value="" disabled>VTT ▼</option>
                            {["es", "en", "pt", "fr", "de", "it", "ru", "zh"].map((l) => (
                              <option key={l} value={l}>
                                {l.toUpperCase()} (.vtt)
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Management Controls: Provision New Room & Live Glossary */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4">
          {/* Provision Room */}
          <section className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-400" />
              Provision New Room
            </h2>
            <form onSubmit={handleCreateRoom} className="space-y-4 text-sm">
              <div>
                <label className="block text-slate-400 mb-1 text-xs font-medium">Room ID</label>
                <input
                  type="text"
                  placeholder="e.g. keynotes, workshop-a"
                  value={newRoomId}
                  onChange={(e) => setNewRoomId(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-700 focus:border-indigo-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 text-xs font-medium">Room Name</label>
                <input
                  type="text"
                  placeholder="e.g. Main Keynotes Stage"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-700 focus:border-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 text-xs font-medium">Engine Provider</label>
                <select
                  value={newProvider}
                  onChange={(e) => setNewProvider(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-700 focus:border-indigo-500 outline-none"
                >
                  <option value="gemini">⚡ Gemini Live API (Multimodal Bidi WebSocket)</option>
                  <option value="gemma">🔒 Gemma 4 On-Premise (Local Edge / Air-Gapped)</option>
                  <option value="mock">🧪 Mock Streaming Provider (Zero API Key)</option>
                </select>
              </div>


              <button
                type="submit"
                className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-semibold text-white transition-all shadow-lg shadow-indigo-600/30"
              >
                Provision Room Session
              </button>
            </form>
          </section>

          {/* Technical Glossary & Context Injection */}
          <section className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-400" />
                Live Glossary & Speaker Priming
              </h2>
              {selectedRoomId && (
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                  {selectedRoomId}
                </span>
              )}
            </div>

            <form onSubmit={handleSaveGlossary} className="space-y-4 text-sm">
              <div>
                <label className="block text-slate-400 mb-1 text-xs font-medium">
                  Technical Jargon Terms (comma-separated)
                </label>
                <textarea
                  rows={3}
                  value={glossaryTerms}
                  onChange={(e) => setGlossaryTerms(e.target.value)}
                  placeholder="Kubernetes, gRPC, BidiGenerateContent, Next.js, backpressure..."
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-700 focus:border-indigo-500 outline-none resize-none font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 text-xs font-medium">
                  Recognized Speaker Names (comma-separated)
                </label>
                <input
                  type="text"
                  value={glossarySpeakers}
                  onChange={(e) => setGlossarySpeakers(e.target.value)}
                  placeholder="Dr. Sarah Chen, Linus Torvalds, Alice Martin"
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-700 focus:border-indigo-500 outline-none font-mono text-xs"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="submit"
                  disabled={!selectedRoomId}
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-semibold text-white transition-all shadow-md shadow-indigo-600/30"
                >
                  Save Glossary to Engine
                </button>

                {glossarySuccess && (
                  <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium animate-pulse">
                    <CheckCircle className="w-4 h-4" /> Updated successfully!
                  </span>
                )}
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
};
