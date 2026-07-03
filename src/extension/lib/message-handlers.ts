import { broadcastHostSetupChange } from "./extension-client";
import { formatError } from "./format-error";
import { isHostSetupComplete } from "./onboarding";
import { OFFSCREEN_PLAYER_MESSAGE } from "./audio/offscreen-messages";
import type { PlaybackController } from "./audio/playback-controller";
import { parseExtensionRequestMessage } from "./messages";
import { pingHost } from "./synthesis/native-messaging";
import {
  broadcastState,
  clearReadAlongContent,
  getReadAlong,
  getSession,
  jumpToChunk,
  preparePlayback,
  replayReadAlong,
  setCachedSettings,
  setSessionError,
  startPageReadAloud,
  startSynthesis,
  stopPlayback,
  syncHostConfig,
} from "./session-manager";
import { readActivePageText } from "./page-text/read-active-page";
import { getSettings, updateSettings } from "./settings";

export interface MessageHandlerContext {
  player: PlaybackController;
}

export async function handleExtensionMessage(
  rawMessage: unknown,
  context: MessageHandlerContext,
): Promise<unknown> {
  if (
    typeof rawMessage === "object" &&
    rawMessage !== null &&
    "type" in rawMessage &&
    rawMessage.type === OFFSCREEN_PLAYER_MESSAGE
  ) {
    return { ok: false, error: "Unknown message type" };
  }

  const parsed = parseExtensionRequestMessage(rawMessage);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  const message = parsed.message;
  const { player } = context;

  switch (message.type) {
    case "GET_STATE":
      return {
        session: getSession(),
        readAlong: getReadAlong(),
        playerState: player.getState(),
        settings: await getSettings(),
      };

    case "CHECK_HOST": {
      try {
        const settings = await getSettings();
        await syncHostConfig(settings);
        const response = await pingHost();

        if (response.type === "pong") {
          const updates: Partial<typeof settings> = {};
          if (response.kokoroPath) {
            updates.kokoroPath = response.kokoroPath;
          }
          if (response.modelDir) {
            updates.modelDir = response.modelDir;
          }

          const finalSettings =
            Object.keys(updates).length > 0 ? await updateSettings(updates) : settings;

          const result = {
            ok: true,
            hostConnected: true,
            kokoroReady: Boolean(response.kokoroReady),
            message: response.message ?? null,
            settings: finalSettings,
          };
          broadcastHostSetupChange(isHostSetupComplete(result));
          return result;
        }

        const result = { ok: false, hostConnected: false, kokoroReady: false };
        broadcastHostSetupChange(false);
        return result;
      } catch (error) {
        const text = formatError(error);
        const result = {
          ok: false,
          hostConnected: false,
          kokoroReady: false,
          error: text,
        };
        broadcastHostSetupChange(false);
        return result;
      }
    }

    case "SAVE_SETTINGS": {
      const settings = await updateSettings(message.settings);
      setCachedSettings(settings);
      const hostSyncWarning = await syncHostConfig(settings);
      await broadcastState();
      return { ok: true, settings, hostSyncWarning };
    }

    case "PREPARE_PLAYBACK":
      await preparePlayback();
      return { ok: true };

    case "START_SYNTHESIS":
      return startSynthesis({
        content: message.content,
        options: message.options,
      });

    case "PLAY":
      await player.play();
      return { ok: true };

    case "PAUSE":
      player.pause();
      return { ok: true };

    case "RESUME":
      await player.resume();
      return { ok: true };

    case "JUMP_TO_CHUNK": {
      const wasPaused = player.getState() === "paused";
      const result = jumpToChunk(message.index);
      if (!result.ok) {
        return result;
      }

      if (wasPaused) {
        await player.resume();
      }

      return { ok: true };
    }

    case "REPLAY_READ_ALONG":
      return replayReadAlong(message.fromChunkIndex ?? 0);

    case "READ_PAGE": {
      const pageText = await readActivePageText();
      if (!pageText.ok) {
        return pageText;
      }

      await startPageReadAloud(pageText.text);
      return { ok: true };
    }

    case "STOP":
      stopPlayback();
      return { ok: true };

    case "CLEAR_READ_ALONG":
      clearReadAlongContent();
      return { ok: true };

    default:
      return { ok: false, error: "Unknown message type" };
  }
}

export async function handleExtensionMessageSafely(
  rawMessage: unknown,
  context: MessageHandlerContext,
): Promise<unknown> {
  try {
    return await handleExtensionMessage(rawMessage, context);
  } catch (error) {
    const text = formatError(error);
    setSessionError(text);
    return { ok: false, error: text };
  }
}
