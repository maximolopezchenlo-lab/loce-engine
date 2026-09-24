import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { RoomSummary } from "../types";

import { AudioIngestPanel } from "./AudioIngestPanel";

export const AdminDashboard: React.FC = () => {

  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"matrix" | "cards">("matrix");

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
      const res = await fetch("/api/rooms");
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
    fetch(`/api/rooms/${selectedRoomId}/glossary`)
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
      const res = await fetch("/api/rooms", {
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
      const res = await fetch(`/api/rooms/${selectedRoomId}/glossary`, {
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
      await fetch(`/api/rooms/${roomId}/${action}`, { method: "POST" });
      fetchRooms();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-slate-800 pb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
                <Activity className="w-7 h-7 text-indigo-500" />
                LOCE Production & Orchestration Dashboard
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Multi-room audio ingestion, Gemini Live cloud, and on-premise Gemma inference monitoring.
              </p>
            </div>
            <button
              onClick={fetchRooms}
              disabled={loading}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-sm font-medium transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
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
                🔒 Gemma On-Premise (Edge) ({rooms.filter((r) => r.provider_type === "gemma").length})
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
          <AudioIngestPanel
            rooms={rooms}
            selectedRoomId={selectedRoomId}
            onRoomSelect={(id) => setSelectedRoomId(id)}
          />
        </section>

        {/* Multi-Room Monitoring Grid & High-Density Matrix */}
        <section className="space-y-4">

          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-400" />
              Active Conference Tracks ({rooms.length})
            </h2>

            {/* View Mode Switcher */}
            <div className="flex items-center rounded-lg p-1 bg-slate-900 border border-slate-800 text-xs">
              <button
                onClick={() => setViewMode("matrix")}
                className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                  viewMode === "matrix"
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                High-Density Matrix (10+ Stages)
              </button>
              <button
                onClick={() => setViewMode("cards")}
                className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                  viewMode === "cards"
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Card Grid
              </button>
            </div>
          </div>

          {viewMode === "matrix" ? (
            /* High-Density Matrix View */
            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/40">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Stage / Room</th>
                    <th className="py-3 px-4">Engine</th>
                    <th className="py-3 px-4">Health Status</th>
                    <th className="py-3 px-4">Avg / P95 Latency</th>
                    <th className="py-3 px-4">Audio Chunks</th>
                    <th className="py-3 px-4">Captions (Final/Partial)</th>
                    <th className="py-3 px-4">Viewers</th>
                    <th className="py-3 px-4">OBS Overlays</th>
                    <th className="py-3 px-4">Exports</th>
                    <th className="py-3 px-4 text-right">Control</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {rooms.map((r) => {
                    const isActive = r.status === "active";
                    const isOptimal = isActive && r.p95_latency_ms > 0 && r.p95_latency_ms <= 50;
                    const isNormal = isActive && (r.p95_latency_ms > 50 && r.p95_latency_ms <= 200 || r.p95_latency_ms === 0);
                    const isHighLatency = isActive && r.p95_latency_ms > 200;

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
                              Gemma Edge
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

                        {/* Traffic-Light Health Indicator */}
                        <td className="py-3 px-4">

                          {!isActive ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] bg-slate-800 text-slate-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                              STOPPED
                            </span>
                          ) : isOptimal ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                              OPTIMAL (&lt;50ms)
                            </span>
                          ) : isNormal ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] bg-yellow-950/60 text-yellow-400 border border-yellow-800/60">
                              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                              NORMAL
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] bg-rose-950/60 text-rose-400 border border-rose-800/60">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                              HIGH LATENCY
                            </span>
                          )}
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
                        <td className="py-3 px-4 font-mono text-indigo-400">
                          {r.subscribers}
                        </td>

                        {/* OBS Overlays */}
                        <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <a
                              href={`/overlay/${r.room_id}?lang=es`}
                              target="_blank"
                              rel="noreferrer"
                              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-semibold"
                            >
                              ES
                            </a>
                            <a
                              href={`/overlay/${r.room_id}?lang=en`}
                              target="_blank"
                              rel="noreferrer"
                              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-semibold"
                            >
                              EN
                            </a>
                            <a
                              href={`/overlay/${r.room_id}?lang=pt`}
                              target="_blank"
                              rel="noreferrer"
                              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-semibold"
                            >
                              PT
                            </a>
                          </div>
                        </td>

                        {/* Exports */}
                        <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <a
                              href={`/api/rooms/${r.room_id}/export/srt?lang=es`}
                              download
                              title="Export SRT (ES)"
                              className="px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white text-[10px]"
                            >
                              SRT
                            </a>
                            <a
                              href={`/api/rooms/${r.room_id}/export/vtt?lang=pt`}
                              download
                              title="Export VTT (PT)"
                              className="px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white text-[10px]"
                            >
                              VTT
                            </a>
                          </div>
                        </td>

                        {/* Control Start/Stop */}
                        <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleStartStop(r.room_id, r.status)}
                            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${
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
            /* Card Grid View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {rooms.map((r) => {
                const isActive = r.status === "active";
                const isSelected = selectedRoomId === r.room_id;

                return (
                  <div
                    key={r.room_id}
                    onClick={() => setSelectedRoomId(r.room_id)}
                    className={`p-5 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-slate-900/90 border-indigo-500 shadow-lg shadow-indigo-500/10"
                        : "bg-slate-900/40 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-base text-white">{r.name}</h3>
                          {r.provider_type === "gemma" ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-800/60">
                              <Shield className="w-2.5 h-2.5 text-purple-400" />
                              Gemma
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
                        <span className="font-mono text-xs text-slate-400">{r.room_id}</span>
                      </div>

                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1.5 ${
                          isActive
                            ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/60"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isActive ? "bg-emerald-400 animate-ping" : "bg-slate-400"
                          }`}
                        />
                        {r.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 py-3 border-y border-slate-800/80 my-3 text-xs">
                      <div>
                        <span className="text-slate-400 block">Avg Latency</span>
                        <span className="font-mono font-semibold text-emerald-400 text-sm">
                          {r.avg_latency_ms} ms
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">P95 Latency</span>
                        <span className="font-mono font-semibold text-slate-200 text-sm">
                          {r.p95_latency_ms} ms
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Audio Chunks</span>
                        <span className="font-mono font-semibold text-slate-200">
                          {r.total_chunks}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Viewers / Subs</span>
                        <span className="font-mono font-semibold text-indigo-400 flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {r.subscribers}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartStop(r.room_id, r.status);
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
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
                          <a
                            href={`/overlay/${r.room_id}?lang=es`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-slate-300 hover:text-white"
                          >
                            ES
                          </a>
                          <a
                            href={`/overlay/${r.room_id}?lang=pt`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-slate-300 hover:text-white"
                          >
                            PT
                          </a>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <a
                          href={`/api/rooms/${r.room_id}/export/srt?lang=es`}
                          download
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                          title="Export SRT"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
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
                  <option value="gemma">🔒 Gemma On-Premise (Local Edge / Air-Gapped)</option>
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
