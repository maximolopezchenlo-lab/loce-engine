import React, { useRef } from "react";
import {
  Mic,
  MicOff,
  Radio,
  UploadCloud,
  Play,
  Pause,
  Square,
  Volume2,
  FileAudio,
  AlertCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useAudioIngest } from "../hooks/useAudioIngest";
import { RoomSummary } from "../types";

interface AudioIngestPanelProps {
  rooms: RoomSummary[];
  selectedRoomId?: string | null;
  onRoomSelect?: (roomId: string) => void;
}

export const AudioIngestPanel: React.FC<AudioIngestPanelProps> = ({
  rooms,
  selectedRoomId,
  onRoomSelect,
}) => {
  const {
    state,
    setRoomId,
    setMode,
    startBroadcast,
    stopBroadcast,
    loadFile,
    loadDemoAudio,
    playFile,
    pauseFile,
    seekFile,
  } = useAudioIngest({
    initialRoomId: selectedRoomId || (rooms.length > 0 ? rooms[0].room_id : "main-stage"),
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync external selectedRoomId if user clicks room table
  React.useEffect(() => {
    if (selectedRoomId && selectedRoomId !== state.roomId) {
      setRoomId(selectedRoomId);
    }
  }, [selectedRoomId, state.roomId, setRoomId]);

  const handleRoomChange = (newId: string) => {
    setRoomId(newId);
    if (onRoomSelect) onRoomSelect(newId);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      loadFile(file);
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const isStreaming = state.status === "STREAMING LIVE";

  return (
    <div className="rounded-2xl border border-indigo-900/40 bg-gradient-to-b from-slate-900/90 to-slate-950/90 p-6 shadow-xl backdrop-blur-md">
      {/* Header & Status Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              Transmisor de Audio en Vivo
              <span className="text-xs font-mono font-normal text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded-full border border-indigo-800/40">
                Web Audio Ingest
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Ingesta de audio directa desde el navegador (PCM 16-bit 16kHz mono) hacia el motor LOCE
            </p>
          </div>
        </div>

        {/* Live Status Badge */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {state.status === "STREAMING LIVE" ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-500/50 shadow-sm shadow-emerald-900/50">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              STREAMING LIVE
            </span>
          ) : state.status === "CONNECTING" ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-yellow-950/80 text-yellow-400 border border-yellow-500/50">
              <RefreshCw className="w-3 h-3 animate-spin" />
              CONNECTING
            </span>
          ) : state.status === "PAUSED" ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-950/80 text-amber-400 border border-amber-500/50">
              <Pause className="w-3 h-3" />
              PAUSED
            </span>
          ) : state.status === "ERROR" ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-950/80 text-rose-400 border border-rose-500/50">
              <AlertCircle className="w-3 h-3" />
              ERROR
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-800/80 text-slate-400 border border-slate-700/50">
              <span className="w-2 h-2 rounded-full bg-slate-500" />
              DESCONECTADO
            </span>
          )}
        </div>
      </div>

      {/* Configuration Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-5">
        {/* Room Target Selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Sala Destino (Target Room)
          </label>
          <select
            value={state.roomId}
            disabled={isStreaming}
            onChange={(e) => handleRoomChange(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none disabled:opacity-50"
          >
            {rooms.map((r) => (
              <option key={r.room_id} value={r.room_id}>
                {r.name} ({r.room_id})
              </option>
            ))}
          </select>
        </div>

        {/* Ingest Mode Toggle */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Modo de Transmisión
          </label>
          <div className="grid grid-cols-2 gap-2 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              disabled={isStreaming}
              onClick={() => setMode("mic")}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                state.mode === "mic"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              } disabled:opacity-50`}
            >
              <Mic className="w-3.5 h-3.5" />
              Micrófono en Vivo
            </button>
            <button
              type="button"
              disabled={isStreaming}
              onClick={() => setMode("file")}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                state.mode === "file"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              } disabled:opacity-50`}
            >
              <FileAudio className="w-3.5 h-3.5" />
              Archivo de Audio
            </button>
          </div>
        </div>
      </div>

      {/* Mode Specific Body */}
      {state.mode === "mic" ? (
        /* Microphone Ingestion View */
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-xl border transition-colors ${
                  isStreaming
                    ? "bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse"
                    : "bg-slate-800 text-slate-400 border-slate-700"
                }`}
              >
                {isStreaming ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-200">
                  {isStreaming ? "Micrófono Transmitiendo en Directo" : "Micrófono Listo"}
                </h4>
                <p className="text-xs text-slate-400">
                  Cancelación de eco de hardware y supresión de ruido activos
                </p>
              </div>
            </div>

            {/* Broadcast Action Button */}
            {!isStreaming ? (
              <button
                type="button"
                onClick={startBroadcast}
                className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-all shadow-lg shadow-emerald-600/30 active:scale-95"
              >
                <Radio className="w-4 h-4" />
                Iniciar Transmisión
              </button>
            ) : (
              <button
                type="button"
                onClick={stopBroadcast}
                className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm transition-all shadow-lg shadow-rose-600/30 active:scale-95"
              >
                <Square className="w-4 h-4 fill-current" />
                Detener Transmisión
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Audio File Ingestion View */
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-5 space-y-4">
          {/* File Upload & Demo Loader Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Fuente de Audio (WAV / MP3 / OGG)
            </span>

            {/* Demo Audio Button */}
            <button
              type="button"
              disabled={isStreaming}
              onClick={() => loadDemoAudio("/fixtures/sample_talk.wav")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/50 text-indigo-300 hover:text-white text-xs font-semibold transition-all disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              Cargar Audio de Demostración
            </button>
          </div>

          {/* Drag & Drop Area */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => !isStreaming && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
              state.fileName
                ? "border-indigo-600/50 bg-indigo-950/10 hover:bg-indigo-950/20"
                : "border-slate-700 hover:border-indigo-500 bg-slate-900/40 hover:bg-slate-900/60"
            } ${isStreaming ? "cursor-not-allowed opacity-60" : ""}`}
          >
            <input
              type="file"
              ref={fileInputRef}
              accept=".wav,.mp3,.ogg,audio/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="flex flex-col items-center justify-center gap-2">
              <UploadCloud className="w-7 h-7 text-indigo-400" />
              {state.fileName ? (
                <div>
                  <p className="text-sm font-bold text-slate-100">{state.fileName}</p>
                  <p className="text-xs text-indigo-400 mt-0.5">
                    Duración: {formatSeconds(state.fileDuration)} (16kHz PCM listo)
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-medium text-slate-300">
                    Arrastrá un archivo aquí o hacé clic para seleccionar
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">Soporta WAV 16-bit, MP3 y OGG</p>
                </div>
              )}
            </div>
          </div>

          {/* File Playback Timeline & Controls */}
          {state.fileName && (
            <div className="space-y-3 pt-2">
              {/* Progress Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-mono text-slate-400">
                  <span>{formatSeconds(state.fileProgress)}</span>
                  <span>{formatSeconds(state.fileDuration)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={state.fileDuration || 1}
                  step={0.1}
                  value={state.fileProgress}
                  onChange={(e) => seekFile(parseFloat(e.target.value))}
                  disabled={!state.fileName}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              {/* Playback Buttons */}
              <div className="flex items-center justify-center gap-3 pt-1">
                {!state.isPlayingFile ? (
                  <button
                    type="button"
                    onClick={playFile}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/30 transition-all active:scale-95"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Transmitir Audio
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={pauseFile}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md shadow-amber-600/30 transition-all active:scale-95"
                  >
                    <Pause className="w-3.5 h-3.5 fill-current" />
                    Pausar
                  </button>
                )}

                <button
                  type="button"
                  onClick={stopBroadcast}
                  disabled={!isStreaming && !state.isPlayingFile}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 transition-all disabled:opacity-40"
                >
                  <Square className="w-3 h-3 fill-current" />
                  Detener
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reactive VU Meter (Volume RMS Level) */}
      <div className="mt-5 space-y-1.5">
        <div className="flex justify-between items-center text-xs">
          <span className="font-semibold text-slate-300 flex items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
            Nivel de Entrada (VU Meter)
          </span>
          <span className="font-mono text-[11px] text-slate-400">
            {state.volumeLevel}% RMS
          </span>
        </div>

        {/* Level Bar */}
        <div className="h-3 w-full bg-slate-900 rounded-full border border-slate-800 overflow-hidden p-0.5">
          <div
            className={`h-full rounded-full transition-all duration-75 ease-out ${
              state.volumeLevel > 85
                ? "bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500"
                : state.volumeLevel > 50
                ? "bg-gradient-to-r from-emerald-500 to-amber-400"
                : "bg-emerald-500"
            }`}
            style={{ width: `${Math.max(2, state.volumeLevel)}%` }}
          />
        </div>
      </div>

      {/* Telemetry Metrics Footer */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-800/80 text-center font-mono">
        <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-sans">Tiempo Vivo</div>
          <div className="text-sm font-bold text-slate-200 mt-0.5">
            {formatSeconds(state.durationLive)}
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-sans">Datos Enviados</div>
          <div className="text-sm font-bold text-indigo-400 mt-0.5">
            {(state.bytesSent / 1024).toFixed(1)} KB
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-sans">Chunks PCM</div>
          <div className="text-sm font-bold text-slate-200 mt-0.5">{state.chunksSent}</div>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider font-sans">Formato Audio</div>
          <div className="text-[11px] font-bold text-emerald-400 mt-1">16kHz 16-bit</div>
        </div>
      </div>

      {/* Error Banner */}
      {state.error && (
        <div className="mt-4 p-3 rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{state.error}</span>
        </div>
      )}
    </div>
  );
};
