import type { PlayerState } from "./audio-player";
import { isRecord } from "../type-guards";

export const OFFSCREEN_PLAYER_MESSAGE = "OFFSCREEN_PLAYER" as const;

export type OffscreenPlayerCommand =
  | { action: "PREPARE_PLAYBACK" }
  | { action: "BEGIN_SEGMENT"; segmentIndex: number; expectingMore: boolean }
  | { action: "ADD_CHUNK"; data: string; final: boolean }
  | { action: "PLAY" }
  | { action: "PAUSE" }
  | { action: "RESUME" }
  | { action: "STOP" }
  | { action: "ABORT_SCHEDULED" };

export type OffscreenPlayerRequest = {
  type: typeof OFFSCREEN_PLAYER_MESSAGE;
  command: OffscreenPlayerCommand;
};

export type OffscreenPlayerResponse = {
  ok: boolean;
  state?: PlayerState;
  error?: string;
};

const PLAYER_STATES = new Set<PlayerState>(["idle", "buffering", "playing", "paused", "stopped"]);

function parsePlayerState(value: unknown): PlayerState | undefined {
  return typeof value === "string" && PLAYER_STATES.has(value as PlayerState)
    ? (value as PlayerState)
    : undefined;
}

export function parseOffscreenPlayerCommand(value: unknown): OffscreenPlayerCommand | null {
  if (!isRecord(value) || typeof value.action !== "string") {
    return null;
  }

  switch (value.action) {
    case "PREPARE_PLAYBACK":
    case "PLAY":
    case "PAUSE":
    case "RESUME":
    case "STOP":
    case "ABORT_SCHEDULED":
      return { action: value.action };
    case "BEGIN_SEGMENT": {
      const segmentIndex =
        typeof value.segmentIndex === "number" && Number.isInteger(value.segmentIndex)
          ? value.segmentIndex
          : null;
      const expectingMore = typeof value.expectingMore === "boolean" ? value.expectingMore : null;
      if (segmentIndex === null || expectingMore === null) {
        return null;
      }
      return { action: "BEGIN_SEGMENT", segmentIndex, expectingMore };
    }
    case "ADD_CHUNK": {
      const data = typeof value.data === "string" ? value.data : null;
      const final = typeof value.final === "boolean" ? value.final : null;
      if (!data || final === null) {
        return null;
      }
      return { action: "ADD_CHUNK", data, final };
    }
    default:
      return null;
  }
}

export function parseOffscreenPlayerRequest(value: unknown): OffscreenPlayerRequest | null {
  if (!isRecord(value) || value.type !== OFFSCREEN_PLAYER_MESSAGE) {
    return null;
  }

  const command = parseOffscreenPlayerCommand(value.command);
  if (!command) {
    return null;
  }

  return { type: OFFSCREEN_PLAYER_MESSAGE, command };
}

export function parseOffscreenPlayerResponse(value: unknown): OffscreenPlayerResponse | null {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    return null;
  }

  return {
    ok: value.ok,
    state: parsePlayerState(value.state),
    error: typeof value.error === "string" ? value.error : undefined,
  };
}
