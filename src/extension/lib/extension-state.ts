import type { PlayerState } from "./audio/audio-player";
import type { ReadAlongState } from "./read-along/read-along";
import type { ExtensionSettings } from "./settings";

export type SessionStatus = "idle" | "synthesizing" | "playing" | "paused" | "error";

export interface SessionState {
  requestId: string | null;
  status: SessionStatus;
  statusMessage: string;
  error: string | null;
  chunkIndex?: number;
  totalChunks?: number;
}

export interface StateUpdateMessage {
  type: "STATE_UPDATE";
  session: SessionState;
  readAlong: ReadAlongState;
  playerState: PlayerState;
  settings: Pick<ExtensionSettings, "voice" | "speed" | "lang">;
}

export function hasReadAlongText(readAlong: ReadAlongState): boolean {
  return readAlong.chunks.length > 0;
}

export function isPlaybackActive(session: SessionState, playerState: PlayerState): boolean {
  return (
    session.status === "synthesizing" ||
    session.status === "playing" ||
    session.status === "paused" ||
    playerState === "playing" ||
    playerState === "buffering" ||
    playerState === "paused"
  );
}

export function isActiveReadAlongSession(
  session: SessionState,
  readAlong: ReadAlongState,
): boolean {
  return (
    hasReadAlongText(readAlong) &&
    (session.status === "synthesizing" ||
      session.status === "playing" ||
      session.status === "paused")
  );
}

export function formatChunkStatusMessage(index: number, total: number): string {
  return total > 1 ? `Playing ${index + 1} of ${total}...` : "Playing audio...";
}
