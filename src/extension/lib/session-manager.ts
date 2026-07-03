import { PlaybackPipeline } from "./synthesis/playback-pipeline";
import type { SessionState } from "./extension-state";
import { formatChunkStatusMessage } from "./extension-state";
import { formatError } from "./format-error";
import { pickBroadcastSettings } from "./messages";
import { onHostMessage, setHostConfig, type HostMessage } from "./synthesis/native-messaging";
import { createPlaybackController } from "./audio/offscreen-playback";
import type { ReadAlongState } from "./read-along/read-along";
import { EMPTY_READ_ALONG } from "./read-along/read-along";
import { getSettings, type ExtensionSettings } from "./settings";
import { joinTextChunks, splitIntoTextChunks } from "./synthesis/text-chunker";
import type { PlaybackController } from "./audio/playback-controller";

const player = createPlaybackController();

let session: SessionState = {
  requestId: null,
  status: "idle",
  statusMessage: "Ready",
  error: null,
};

let activePipeline: PlaybackPipeline | null = null;
let readAlong: ReadAlongState = { ...EMPTY_READ_ALONG };
let cachedSettings: ExtensionSettings | null = null;

export function getSession(): SessionState {
  return session;
}

export function getReadAlong(): ReadAlongState {
  return readAlong;
}

export function getPlayer(): PlaybackController {
  return player;
}

export async function refreshCachedSettings(): Promise<ExtensionSettings> {
  cachedSettings = await getSettings();
  return cachedSettings;
}

export function setCachedSettings(settings: ExtensionSettings): void {
  cachedSettings = settings;
}

function clearReadAlong(): void {
  readAlong = { ...EMPTY_READ_ALONG };
}

function setSession(partial: Partial<SessionState>): SessionState {
  session = { ...session, ...partial };
  void broadcastState();
  return session;
}

export async function broadcastState(): Promise<void> {
  if (!cachedSettings) {
    cachedSettings = await getSettings();
  }

  const payload = {
    type: "STATE_UPDATE" as const,
    session,
    readAlong,
    playerState: player.getState(),
    settings: pickBroadcastSettings(cachedSettings),
  };

  try {
    await browser.runtime.sendMessage(payload);
  } catch {
    // No listeners are open.
  }
}

export async function syncHostConfig(settings: ExtensionSettings): Promise<string | undefined> {
  try {
    await setHostConfig(settings.kokoroPath, settings.modelDir);
    return undefined;
  } catch (error) {
    return formatError(error);
  }
}

function resetSession(): void {
  session = {
    requestId: null,
    status: "idle",
    statusMessage: "Ready",
    error: null,
  };
  void broadcastState();
}

function cancelActiveSynthesis(): void {
  if (activePipeline) {
    activePipeline.cancel();
    activePipeline = null;
  }
}

function handleHostMessage(message: HostMessage): void {
  activePipeline?.handleHostMessage(message);
}

async function prepareForSynthesis(
  settings?: ExtensionSettings,
): Promise<{ settings: ExtensionSettings; hostSyncWarning?: string }> {
  const resolvedSettings = settings ?? (await refreshCachedSettings());
  const hostSyncWarning = await syncHostConfig(resolvedSettings);
  cancelActiveSynthesis();
  player.stop();
  return { settings: resolvedSettings, hostSyncWarning };
}

async function startTextSynthesis(
  content: string,
  settings: ExtensionSettings,
  options?: Partial<ExtensionSettings>,
): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> {
  const mergedSettings: ExtensionSettings = {
    ...settings,
    voice: options?.voice ?? settings.voice,
    speed: options?.speed ?? settings.speed,
    lang: options?.lang ?? settings.lang,
    format: options?.format ?? settings.format,
  };

  const chunks = splitIntoTextChunks(content);
  readAlong = {
    chunks,
    activeChunkIndex: null,
  };

  const pipeline = new PlaybackPipeline({
    text: content,
    chunks,
    settings: mergedSettings,
    player,
    callbacks: {
      onProgress: (message) => {
        setSession({
          status: "synthesizing",
          statusMessage: message,
          error: null,
          requestId: pipeline.sessionId,
          totalChunks: pipeline.totalParts,
        });
      },
      onPartPlaying: (index, total) => {
        readAlong = { ...readAlong, activeChunkIndex: index };
        setSession({
          status: "playing",
          statusMessage: formatChunkStatusMessage(index, total),
          chunkIndex: index,
          totalChunks: total,
          error: null,
        });
      },
      onComplete: () => {
        activePipeline = null;
        setSession({
          status: "idle",
          statusMessage: "Playback complete",
          error: null,
          requestId: null,
          chunkIndex: undefined,
          totalChunks: undefined,
        });
      },
      onError: (message) => {
        activePipeline = null;
        player.stop();
        setSession({
          status: "error",
          statusMessage: "Synthesis failed",
          error: message,
          requestId: null,
          chunkIndex: undefined,
          totalChunks: undefined,
        });
      },
    },
  });

  activePipeline = pipeline;
  setSession({
    requestId: pipeline.sessionId,
    status: "synthesizing",
    statusMessage:
      pipeline.totalParts > 1
        ? `Preparing 1 of ${pipeline.totalParts}...`
        : "Sending request to kokoro-tts...",
    error: null,
    chunkIndex: 0,
    totalChunks: pipeline.totalParts,
  });

  pipeline.start();
  return { ok: true, requestId: pipeline.sessionId };
}

export async function startSynthesis(input: {
  content: string;
  options?: Partial<ExtensionSettings>;
}): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> {
  try {
    const { settings, hostSyncWarning } = await prepareForSynthesis();
    if (hostSyncWarning) {
      throw new Error(hostSyncWarning);
    }

    return await startTextSynthesis(input.content, settings, input.options);
  } catch (error) {
    const text = formatError(error);
    setSession({ status: "error", statusMessage: "Request failed", error: text });
    return { ok: false, error: text };
  }
}

export async function preparePlayback(): Promise<void> {
  if (player.preparePlayback) {
    await player.preparePlayback();
  }
}

export async function startContextMenuReadAloud(text: string): Promise<void> {
  await preparePlayback();
  await startSynthesis({ content: text });
}

export async function startPageReadAloud(text: string): Promise<void> {
  return startContextMenuReadAloud(text);
}

export async function replayReadAlong(
  fromChunkIndex = 0,
): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> {
  const content = joinTextChunks(readAlong.chunks);
  if (!content.trim()) {
    return { ok: false, error: "No text to replay" };
  }

  await preparePlayback();
  const { settings, hostSyncWarning } = await prepareForSynthesis();
  if (hostSyncWarning) {
    return { ok: false, error: hostSyncWarning };
  }

  const result = await startTextSynthesis(content, settings);
  if (!result.ok) {
    return result;
  }

  if (fromChunkIndex > 0 && activePipeline) {
    activePipeline.jumpTo(fromChunkIndex);
    readAlong = { ...readAlong, activeChunkIndex: fromChunkIndex };
    setSession({
      status: "playing",
      statusMessage: formatChunkStatusMessage(fromChunkIndex, activePipeline.totalParts),
      chunkIndex: fromChunkIndex,
      totalChunks: activePipeline.totalParts,
      error: null,
    });
  }

  return result;
}

export function jumpToChunk(index: number): { ok: true } | { ok: false; error: string } {
  if (!activePipeline?.isActive) {
    return { ok: false, error: "No active session" };
  }

  if (index < 0 || index >= activePipeline.totalParts) {
    return { ok: false, error: "Invalid chunk index" };
  }

  activePipeline.jumpTo(index);
  readAlong = { ...readAlong, activeChunkIndex: index };
  setSession({
    status: "playing",
    statusMessage: formatChunkStatusMessage(index, activePipeline.totalParts),
    chunkIndex: index,
    totalChunks: activePipeline.totalParts,
    error: null,
  });

  return { ok: true };
}

export function stopPlayback(): void {
  cancelActiveSynthesis();
  player.stop();
  readAlong = { ...readAlong, activeChunkIndex: null };
  resetSession();
}

export function clearReadAlongContent(): void {
  clearReadAlong();
  if (session.status !== "error") {
    resetSession();
  } else {
    void broadcastState();
  }
}

export function setSessionError(message: string): void {
  setSession({ status: "error", statusMessage: "Request failed", error: message });
}

export function initSessionManager(): void {
  void refreshCachedSettings();
  onHostMessage(handleHostMessage);

  player.onStateChange((playerState) => {
    if (playerState === "playing") {
      if (session.status !== "playing") {
        setSession({
          status: "playing",
          statusMessage: session.statusMessage || "Playing audio...",
        });
      }
      return;
    }

    if (playerState === "paused") {
      setSession({ status: "paused", statusMessage: "Paused" });
      return;
    }

    if (playerState === "stopped" && session.status !== "error") {
      if (session.status !== "idle") {
        if (!activePipeline?.isActive) {
          setSession({ statusMessage: "Playback complete" });
          resetSession();
        }
        return;
      }

      void broadcastState();
    }
  });
}
