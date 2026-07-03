import type { PlayerState } from "./audio-player";
import { LocalPlaybackController } from "./local-playback";
import {
  OFFSCREEN_PLAYER_MESSAGE,
  parseOffscreenPlayerResponse,
  type OffscreenPlayerCommand,
  type OffscreenPlayerRequest,
  type OffscreenPlayerResponse,
} from "./offscreen-messages";
import type { PlaybackController } from "./playback-controller";

interface OffscreenApi {
  hasDocument(): Promise<boolean>;
  createDocument(options: { url: string; reasons: string[]; justification: string }): Promise<void>;
}

function getOffscreenApi(): OffscreenApi | undefined {
  const chromeGlobal = globalThis as { chrome?: { offscreen?: OffscreenApi } };
  return chromeGlobal.chrome?.offscreen;
}

async function ensureOffscreenDocument(): Promise<void> {
  const offscreen = getOffscreenApi();
  if (!offscreen?.createDocument) {
    return;
  }

  if (await offscreen.hasDocument()) {
    return;
  }

  await offscreen.createDocument({
    url: browser.runtime.getURL("/offscreen.html"),
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Play TTS audio streamed from the kokoro-tts native host",
  });
}

async function sendOffscreenCommand(
  command: OffscreenPlayerCommand,
): Promise<OffscreenPlayerResponse> {
  await ensureOffscreenDocument();

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const rawResponse = await browser.runtime.sendMessage({
        type: OFFSCREEN_PLAYER_MESSAGE,
        command,
      } satisfies OffscreenPlayerRequest);
      const response = parseOffscreenPlayerResponse(rawResponse);

      if (!response?.ok) {
        throw new Error(response?.error ?? "Offscreen playback command failed.");
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }

  throw lastError ?? new Error("Offscreen playback command failed.");
}

class OffscreenPlaybackController implements PlaybackController {
  private state: PlayerState = "idle";
  private readonly stateListeners = new Set<(state: PlayerState) => void>();
  private readonly segmentListeners = new Set<(segmentIndex: number) => void>();
  private readonly segmentEndedListeners = new Set<(segmentIndex: number) => void>();
  private readonly messageListener = (message: {
    type?: string;
    state?: PlayerState;
    segmentIndex?: number;
  }): void => {
    if (message.type === "PLAYER_STATE_CHANGE" && message.state) {
      this.state = message.state;
      for (const listener of this.stateListeners) {
        listener(message.state);
      }
      return;
    }

    if (message.type === "PLAYER_SEGMENT_START" && message.segmentIndex !== undefined) {
      for (const listener of this.segmentListeners) {
        listener(message.segmentIndex);
      }
      return;
    }

    if (message.type === "PLAYER_SEGMENT_END" && message.segmentIndex !== undefined) {
      for (const listener of this.segmentEndedListeners) {
        listener(message.segmentIndex);
      }
    }
  };

  constructor() {
    browser.runtime.onMessage.addListener(this.messageListener);
  }

  private applyResponse(response: OffscreenPlayerResponse): void {
    if (response.state) {
      this.state = response.state;
    }
  }

  async preparePlayback(): Promise<void> {
    const response = await sendOffscreenCommand({ action: "PREPARE_PLAYBACK" });
    this.applyResponse(response);
  }

  async beginSegment(segmentIndex: number, expectingMore: boolean): Promise<void> {
    const response = await sendOffscreenCommand({
      action: "BEGIN_SEGMENT",
      segmentIndex,
      expectingMore,
    });
    this.applyResponse(response);
  }

  async addChunk(base64Data: string, final: boolean): Promise<void> {
    const response = await sendOffscreenCommand({ action: "ADD_CHUNK", data: base64Data, final });
    this.applyResponse(response);
  }

  async play(): Promise<void> {
    const response = await sendOffscreenCommand({ action: "PLAY" });
    this.applyResponse(response);
  }

  pause(): void {
    void sendOffscreenCommand({ action: "PAUSE" }).then((response) => this.applyResponse(response));
  }

  async resume(): Promise<void> {
    const response = await sendOffscreenCommand({ action: "RESUME" });
    this.applyResponse(response);
  }

  stop(): void {
    void sendOffscreenCommand({ action: "STOP" }).then((response) => this.applyResponse(response));
  }

  abortScheduledPlayback(): Promise<void> {
    return sendOffscreenCommand({ action: "ABORT_SCHEDULED" }).then((response) =>
      this.applyResponse(response),
    );
  }

  getState(): PlayerState {
    return this.state;
  }

  onStateChange(listener: (state: PlayerState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  onSegmentPlayback(listener: (segmentIndex: number) => void): () => void {
    this.segmentListeners.add(listener);
    return () => this.segmentListeners.delete(listener);
  }

  onSegmentEnded(listener: (segmentIndex: number) => void): () => void {
    this.segmentEndedListeners.add(listener);
    return () => this.segmentEndedListeners.delete(listener);
  }
}

export function createPlaybackController(): PlaybackController {
  if (import.meta.env.CHROME) {
    return new OffscreenPlaybackController();
  }

  return new LocalPlaybackController();
}
