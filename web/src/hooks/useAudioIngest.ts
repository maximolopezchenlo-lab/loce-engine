/**
 * Web Audio API Ingestion Hook for LiveVoice Open-Caption Engine (LOCE).
 *
 * Supports:
 * 1. Live Microphone capture with hardware echo cancellation, noise suppression,
 *    and client-side downsampling from native rate (44.1/48kHz) to 16kHz PCM 16-bit mono.
 * 2. Local Audio File decoding (WAV, MP3, OGG) and 1x real-time streaming cadence.
 * 3. Reactive RMS VU Meter level calculation.
 * 4. WebSocket streaming to /ws/ingest/:roomId.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { getWebSocketBaseUrl, getConfig, getApiUrl } from "../utils/config";

export type IngestMode = "mic" | "file";
export type IngestStatus = "DISCONNECTED" | "CONNECTING" | "STREAMING LIVE" | "PAUSED" | "ERROR";

export interface AudioIngestState {
  status: IngestStatus;
  mode: IngestMode;
  roomId: string;
  volumeLevel: number; // 0..100 (RMS)
  bytesSent: number;
  chunksSent: number;
  durationLive: number; // seconds streaming
  error: string | null;
  activeSocketsCount: number;

  // File-specific state
  fileName: string | null;
  fileDuration: number; // seconds
  fileProgress: number; // seconds
  isPlayingFile: boolean;
}

export interface UseAudioIngestOptions {
  initialRoomId?: string;
  chunkMs?: number; // default 200ms
  targetSampleRate?: number; // default 16000
  activeRooms?: (string | { room_id: string })[];
}

/**
 * Downsamples a Float32Array to 16kHz and converts to 16-bit signed PCM (Int16Array).
 * Uses windowed box-car decimation to prevent aliasing.
 */
export function downsampleTo16k(
  buffer: Float32Array,
  inputSampleRate: number,
  targetSampleRate = 16000
): Int16Array {
  if (inputSampleRate === targetSampleRate) {
    const result = new Int16Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      const s = Math.max(-1, Math.min(1, buffer[i]));
      result[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return result;
  }

  const ratio = inputSampleRate / targetSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Int16Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(buffer.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += buffer[j];
      count++;
    }
    const sample = count > 0 ? sum / count : 0;
    const s = Math.max(-1, Math.min(1, sample));
    result[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return result;
}

/**
 * Calculates normalized RMS volume level [0..100].
 */
export function calculateRmsLevel(samples: Float32Array | Int16Array): number {
  if (!samples.length) return 0;
  let sumSquares = 0;

  if (samples instanceof Float32Array) {
    for (let i = 0; i < samples.length; i++) {
      sumSquares += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sumSquares / samples.length);
    return Math.min(100, Math.round(rms * 280));
  } else {
    for (let i = 0; i < samples.length; i++) {
      const norm = samples[i] / 32768.0;
      sumSquares += norm * norm;
    }
    const rms = Math.sqrt(sumSquares / samples.length);
    return Math.min(100, Math.round(rms * 280));
  }
}

export const MAX_AUDIO_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB max size limit to prevent memory exhaustion

export function useAudioIngest(options: UseAudioIngestOptions = {}) {
  const { initialRoomId = "main-stage", chunkMs = 200, targetSampleRate = 16000 } = options;

  const [roomId, setRoomId] = useState(initialRoomId);
  const [mode, setMode] = useState<IngestMode>("mic");
  const [status, setStatus] = useState<IngestStatus>("DISCONNECTED");
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [bytesSent, setBytesSent] = useState(0);
  const [chunksSent, setChunksSent] = useState(0);
  const [durationLive, setDurationLive] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // File state
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileDuration, setFileDuration] = useState(0);
  const [fileProgress, setFileProgress] = useState(0);
  const [isPlayingFile, setIsPlayingFile] = useState(false);
  const [activeSocketsCount, setActiveSocketsCount] = useState(0);

  // References
  const wsRef = useRef<WebSocket | null>(null);
  const socketsRef = useRef<WebSocket[]>([]);
  const activeRoomsRef = useRef<(string | { room_id: string })[]>(options.activeRooms || []);

  useEffect(() => {
    if (options.activeRooms) {
      activeRoomsRef.current = options.activeRooms;
    }
  }, [options.activeRooms]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);

  // Buffer accumulator for live mic chunks
  const micAccumulatorRef = useRef<number[]>([]);
  const samplesPerChunk = Math.round(targetSampleRate * (chunkMs / 1000)); // 3200 samples for 200ms

  // File streaming decoded buffer and timer
  const filePcmDataRef = useRef<Int16Array | null>(null);
  const fileChunkIndexRef = useRef<number>(0);
  const fileTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);


  // Determine WebSocket URL with dynamic backend resolution and credentials
  const getWsIngestUrl = useCallback(
    (targetRoom: string) => {
      const baseUrl = getWebSocketBaseUrl();
      const cfg = getConfig();
      const params = new URLSearchParams({
        sample_rate: String(targetSampleRate),
        channels: "1",
      });
      if (cfg.apiKey) {
        params.set("api_key", cfg.apiKey);
      }
      if (cfg.providerMode) {
        params.set("provider", cfg.providerMode);
      }
      return `${baseUrl}/api/rooms/${encodeURIComponent(targetRoom)}/ingest?${params.toString()}`;
    },
    [targetSampleRate]
  );

  // Ensure AudioContext is instantiated and running
  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  // Teardown microphone stream
  const cleanupMic = useCallback(() => {
    if (scriptNodeRef.current) {
      scriptNodeRef.current.disconnect();
      scriptNodeRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    micAccumulatorRef.current = [];
  }, []);

  // Teardown file playback timer
  const cleanupFileTimer = useCallback(() => {
    if (fileTimerRef.current) {
      clearInterval(fileTimerRef.current);
      fileTimerRef.current = null;
    }
    setIsPlayingFile(false);
  }, []);

  // Full stop & disconnect all open sockets
  const stopBroadcast = useCallback(() => {
    cleanupMic();
    cleanupFileTimer();

    if (liveTimerRef.current) {
      clearInterval(liveTimerRef.current);
      liveTimerRef.current = null;
    }

    if (socketsRef.current.length > 0) {
      for (const ws of socketsRef.current) {
        try {
          ws.close();
        } catch (err) {
          console.error("Error closing WebSocket:", err);
        }
      }
      socketsRef.current = [];
    }

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (err) {
        console.error("Error closing WebSocket:", err);
      }
      wsRef.current = null;
    }

    setActiveSocketsCount(0);
    setVolumeLevel(0);
    setStatus("DISCONNECTED");
  }, [cleanupMic, cleanupFileTimer]);

  // Connect WebSocket(s) to /api/rooms/:roomId/ingest
  const connectWebSockets = useCallback(
    async (targetRoom: string): Promise<WebSocket[]> => {
      const existingOpen = socketsRef.current.filter((ws) => ws.readyState === WebSocket.OPEN);
      if (existingOpen.length > 0) {
        return existingOpen;
      }

      setStatus("CONNECTING");
      setError(null);

      const resolvedRooms: string[] =
        targetRoom === "ALL_ROOMS"
          ? activeRoomsRef.current.length > 0
            ? activeRoomsRef.current.map((r) => (typeof r === "string" ? r : r.room_id))
            : ["main-stage", "track-1", "track-2"]
          : [targetRoom];

      const uniqueRooms = Array.from(new Set(resolvedRooms)).filter(
        (id) => Boolean(id) && id !== "ALL_ROOMS"
      );

      if (uniqueRooms.length === 0) {
        uniqueRooms.push("main-stage");
      }

      const openedSockets: WebSocket[] = [];

      const connectPromises = uniqueRooms.map((r) => {
        return new Promise<WebSocket>((resolve, reject) => {
          const url = getWsIngestUrl(r);
          const ws = new WebSocket(url);
          ws.binaryType = "arraybuffer";

          ws.onopen = () => {
            openedSockets.push(ws);
            resolve(ws);
          };

          ws.onerror = (e) => {
            console.error(`WebSocket Ingest Error for room '${r}':`, e);
            if (uniqueRooms.length === 1) {
              reject(new Error(`WebSocket connection failed for room ${r}`));
            } else {
              resolve(ws);
            }
          };

          ws.onclose = () => {
            socketsRef.current = socketsRef.current.filter((s) => s !== ws);
            setActiveSocketsCount(
              socketsRef.current.filter((s) => s.readyState === WebSocket.OPEN).length
            );
            if (socketsRef.current.length === 0) {
              setStatus((currentStatus) =>
                currentStatus === "STREAMING LIVE" ? "DISCONNECTED" : currentStatus
              );
            }
          };
        });
      });

      try {
        await Promise.allSettled(connectPromises);
        const validSockets = openedSockets.filter((s) => s.readyState === WebSocket.OPEN);

        if (validSockets.length === 0) {
          throw new Error("No se pudo conectar a ninguna sala de ingesta.");
        }

        socketsRef.current = validSockets;
        wsRef.current = validSockets[0] || null;
        setActiveSocketsCount(validSockets.length);
        setStatus("STREAMING LIVE");
        return validSockets;
      } catch (err: unknown) {
        console.error("Error connecting WebSockets:", err);
        setError("Error al conectar con el servidor de ingesta.");
        setStatus("ERROR");
        throw err;
      }
    },
    [getWsIngestUrl]
  );

  // Send a raw Int16 PCM chunk over all active WebSockets
  const sendPcmChunk = useCallback((chunk: Int16Array) => {
    const openSockets = socketsRef.current.filter((ws) => ws.readyState === WebSocket.OPEN);
    if (openSockets.length > 0) {
      const buffer = chunk.buffer;
      for (const ws of openSockets) {
        try {
          ws.send(buffer);
        } catch (err) {
          console.error("Error sending PCM chunk to socket:", err);
        }
      }
      setBytesSent((prev) => prev + chunk.byteLength * openSockets.length);
      setChunksSent((prev) => prev + openSockets.length);
    }
  }, []);

  // Start Live Microphone Streaming
  const startMicStreaming = useCallback(async () => {
    try {
      setError(null);
      const audioCtx = getAudioContext();
      await connectWebSockets(roomId);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      mediaStreamRef.current = stream;

      const source = audioCtx.createMediaStreamSource(stream);
      // bufferSize = 4096 gives ~85ms at 48kHz
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      scriptNodeRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const level = calculateRmsLevel(inputData);
        setVolumeLevel(level);

        // Downsample input from native rate to 16kHz Int16
        const downsampled = downsampleTo16k(inputData, audioCtx.sampleRate, targetSampleRate);

        // Accumulate until ~200ms
        const acc = micAccumulatorRef.current;
        for (let i = 0; i < downsampled.length; i++) {
          acc.push(downsampled[i]);
        }

        while (acc.length >= samplesPerChunk) {
          const chunkSamples = acc.splice(0, samplesPerChunk);
          const chunkInt16 = new Int16Array(chunkSamples);
          sendPcmChunk(chunkInt16);
        }
      };

      source.connect(processor);
      // Connect to destination to keep ScriptProcessor running (Chrome requirement)
      const silenceGain = audioCtx.createGain();
      silenceGain.gain.value = 0;
      processor.connect(silenceGain);
      silenceGain.connect(audioCtx.destination);

      // Start duration ticker
      liveTimerRef.current = setInterval(() => {
        setDurationLive((prev) => prev + 1);
      }, 1000);
    } catch (err: unknown) {
      console.error("Microphone capture error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Microphone error: ${msg}`);
      setStatus("ERROR");
      stopBroadcast();
    }
  }, [getAudioContext, connectWebSockets, roomId, targetSampleRate, samplesPerChunk, sendPcmChunk, stopBroadcast]);

  // Decode ArrayBuffer into 16kHz Int16Array mono
  const decodeAndProcessAudio = useCallback(
    async (arrayBuffer: ArrayBuffer, name: string) => {
      try {
        setError(null);
        if (arrayBuffer.byteLength > MAX_AUDIO_FILE_SIZE_BYTES) {
          setError(
            `El archivo excede el tamaño máximo permitido de 100 MB (${(
              arrayBuffer.byteLength / (1024 * 1024)
            ).toFixed(1)} MB).`
          );
          return;
        }

        const audioCtx = getAudioContext();
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);

        const numChannels = decoded.numberOfChannels;
        const length = decoded.length;
        const monoFloat = new Float32Array(length);

        if (numChannels === 1) {
          monoFloat.set(decoded.getChannelData(0));
        } else {
          // Average stereo / multi-channel to mono
          const ch0 = decoded.getChannelData(0);
          const ch1 = decoded.getChannelData(1);
          for (let i = 0; i < length; i++) {
            monoFloat[i] = (ch0[i] + ch1[i]) * 0.5;
          }
        }

        // Downsample to 16kHz
        const pcm16 = downsampleTo16k(monoFloat, decoded.sampleRate, targetSampleRate);
        filePcmDataRef.current = pcm16;
        fileChunkIndexRef.current = 0;

        const durSec = pcm16.length / targetSampleRate;
        setFileName(name);
        setFileDuration(durSec);
        setFileProgress(0);
      } catch (err: unknown) {
        console.error("Audio decoding error:", err);
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Failed to decode audio file: ${msg}`);
      }
    },
    [getAudioContext, targetSampleRate]
  );

  // Load a user-provided File
  const loadFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_AUDIO_FILE_SIZE_BYTES) {
        setError(
          `El archivo excede el tamaño máximo permitido de 100 MB (${(
            file.size / (1024 * 1024)
          ).toFixed(1)} MB).`
        );
        return;
      }
      const buffer = await file.arrayBuffer();
      await decodeAndProcessAudio(buffer, file.name);
    },
    [decodeAndProcessAudio]
  );

  // Load demo audio from /fixtures/sample_talk.wav
  const loadDemoAudio = useCallback(
    async (url = "/fixtures/sample_talk.wav") => {
      try {
        setError(null);
        const targetUrl = url.startsWith("http") ? url : getApiUrl(url);
        const res = await fetch(targetUrl);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: Failed to load ${targetUrl}`);
        }
        const buffer = await res.arrayBuffer();
        await decodeAndProcessAudio(buffer, "sample_talk.wav (Demo Fixture)");
      } catch (err: unknown) {
        console.error("Demo audio load error:", err);
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Could not fetch demo audio: ${msg}`);
      }
    },
    [decodeAndProcessAudio]
  );

  // Start or resume file streaming at 1x real-time speed
  const playFile = useCallback(async () => {
    if (!filePcmDataRef.current) {
      setError("No audio file loaded. Please load a file or click 'Cargar Audio de Demostración'.");
      return;
    }

    try {
      await connectWebSockets(roomId);
      setIsPlayingFile(true);
      setStatus("STREAMING LIVE");

      if (fileTimerRef.current) clearInterval(fileTimerRef.current);

      fileTimerRef.current = setInterval(() => {
        const pcm = filePcmDataRef.current;
        if (!pcm) {
          cleanupFileTimer();
          return;
        }

        const startIndex = fileChunkIndexRef.current * samplesPerChunk;
        if (startIndex >= pcm.length) {
          // Playback finished
          cleanupFileTimer();
          setVolumeLevel(0);
          setStatus("DISCONNECTED");
          return;
        }

        const endIndex = Math.min(startIndex + samplesPerChunk, pcm.length);
        const chunk = new Int16Array(samplesPerChunk);
        chunk.set(pcm.subarray(startIndex, endIndex));

        // Volume meter and send
        const level = calculateRmsLevel(chunk);
        setVolumeLevel(level);
        sendPcmChunk(chunk);

        fileChunkIndexRef.current += 1;
        const currentSec = (fileChunkIndexRef.current * chunkMs) / 1000;
        setFileProgress(Math.min(currentSec, fileDuration));
        setDurationLive((prev) => prev + chunkMs / 1000);
      }, chunkMs);
    } catch (err) {
      console.error("File stream error:", err);
      setStatus("ERROR");
    }
  }, [connectWebSockets, roomId, samplesPerChunk, chunkMs, sendPcmChunk, fileDuration, cleanupFileTimer]);

  // Pause file playback
  const pauseFile = useCallback(() => {
    cleanupFileTimer();
    setStatus("PAUSED");
    setVolumeLevel(0);
  }, [cleanupFileTimer]);

  // Seek file position
  const seekFile = useCallback(
    (targetSeconds: number) => {
      const pcm = filePcmDataRef.current;
      if (!pcm) return;
      const targetSample = Math.round(targetSeconds * targetSampleRate);
      fileChunkIndexRef.current = Math.floor(targetSample / samplesPerChunk);
      setFileProgress(targetSeconds);
    },
    [targetSampleRate, samplesPerChunk]
  );

  // Main start toggle
  const startBroadcast = useCallback(() => {
    if (mode === "mic") {
      startMicStreaming();
    } else {
      playFile();
    }
  }, [mode, startMicStreaming, playFile]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopBroadcast();
    };
  }, [stopBroadcast]);

  return {
    state: {
      status,
      mode,
      roomId,
      volumeLevel,
      bytesSent,
      chunksSent,
      durationLive,
      error,
      activeSocketsCount,
      fileName,
      fileDuration,
      fileProgress,
      isPlayingFile,
    } as AudioIngestState,
    setRoomId,
    setMode,
    startBroadcast,
    stopBroadcast,
    loadFile,
    loadDemoAudio,
    playFile,
    pauseFile,
    seekFile,
  };
}
