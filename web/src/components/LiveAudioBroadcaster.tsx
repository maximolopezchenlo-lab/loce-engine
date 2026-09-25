import React from "react";
import { AudioIngestPanel } from "./AudioIngestPanel";
import { RoomSummary } from "../types";

export interface LiveAudioBroadcasterProps {
  rooms: RoomSummary[];
  selectedRoomId?: string | null;
  onRoomSelect?: (roomId: string) => void;
}

/**
 * LiveAudioBroadcaster component.
 * Direct alias / wrapper around AudioIngestPanel for modular browser audio ingestion.
 */
export const LiveAudioBroadcaster: React.FC<LiveAudioBroadcasterProps> = (props) => {
  return <AudioIngestPanel {...props} />;
};

export default LiveAudioBroadcaster;
