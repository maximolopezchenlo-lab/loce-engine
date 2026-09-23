export interface CaptionEvent {
  id: string;
  room_id: string;
  original_language: string;
  target_language: string;
  text: string;
  original_text?: string | null;
  is_final: boolean;
  start_ms: number;
  end_ms: number;
  confidence: number;
  speaker?: string | null;
  timestamp_iso: string;
}

export interface RoomMetrics {
  total_bytes: number;
  total_chunks: number;
  partial_captions: number;
  final_captions: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
}

export interface RoomSummary {
  room_id: string;
  name: string;
  status: "idle" | "active" | "paused" | "stopped";
  source_language: string;
  target_languages: string[];
  provider_type: string;
  is_healthy: boolean;
  subscribers: number;
  total_bytes: number;
  total_chunks: number;
  partial_captions: number;
  final_captions: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  history_count: number;
}
