import type { ExtensionSettings } from "./settings";
import { sanitizeSettingsPartial } from "./settings";
import { isRecord } from "./type-guards";

export const MAX_SYNTHESIS_CONTENT_LENGTH = 500_000;

export type ExtensionRequestMessage =
  | { type: "GET_STATE" }
  | { type: "CHECK_HOST" }
  | { type: "SAVE_SETTINGS"; settings: Partial<ExtensionSettings> }
  | { type: "PREPARE_PLAYBACK" }
  | {
      type: "START_SYNTHESIS";
      content: string;
      options?: Partial<ExtensionSettings>;
    }
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "JUMP_TO_CHUNK"; index: number }
  | { type: "REPLAY_READ_ALONG"; fromChunkIndex?: number }
  | { type: "READ_PAGE" }
  | { type: "STOP" }
  | { type: "CLEAR_READ_ALONG" };

export type ExtensionRequestParseResult =
  { ok: true; message: ExtensionRequestMessage } | { ok: false; error: string };

function parseStringContent(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  if (value.length > MAX_SYNTHESIS_CONTENT_LENGTH) {
    return null;
  }

  return value;
}

function parseChunkIndex(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }

  return value;
}

function parseFromChunkIndex(value: unknown): number {
  if (value === undefined) {
    return 0;
  }

  return parseChunkIndex(value) ?? 0;
}

export function parseExtensionRequestMessage(raw: unknown): ExtensionRequestParseResult {
  if (!isRecord(raw) || typeof raw.type !== "string") {
    return { ok: false, error: "Unknown message type" };
  }

  switch (raw.type) {
    case "GET_STATE":
    case "CHECK_HOST":
    case "PREPARE_PLAYBACK":
    case "PLAY":
    case "PAUSE":
    case "RESUME":
    case "READ_PAGE":
    case "STOP":
    case "CLEAR_READ_ALONG":
      return { ok: true, message: { type: raw.type } };

    case "SAVE_SETTINGS": {
      const settings = isRecord(raw.settings) ? sanitizeSettingsPartial(raw.settings) : {};
      return { ok: true, message: { type: "SAVE_SETTINGS", settings } };
    }

    case "START_SYNTHESIS": {
      const content = parseStringContent(raw.content);
      if (content === null) {
        return { ok: false, error: "Invalid synthesis content" };
      }

      const options = isRecord(raw.options) ? sanitizeSettingsPartial(raw.options) : undefined;
      return { ok: true, message: { type: "START_SYNTHESIS", content, options } };
    }

    case "JUMP_TO_CHUNK": {
      const index = parseChunkIndex(raw.index);
      if (index === null) {
        return { ok: false, error: "Invalid chunk index" };
      }

      return { ok: true, message: { type: "JUMP_TO_CHUNK", index } };
    }

    case "REPLAY_READ_ALONG":
      return {
        ok: true,
        message: {
          type: "REPLAY_READ_ALONG",
          fromChunkIndex: parseFromChunkIndex(raw.fromChunkIndex),
        },
      };

    default:
      return { ok: false, error: "Unknown message type" };
  }
}

export function pickBroadcastSettings(
  settings: ExtensionSettings,
): Pick<ExtensionSettings, "voice" | "speed" | "lang"> {
  return {
    voice: settings.voice,
    speed: settings.speed,
    lang: settings.lang,
  };
}
