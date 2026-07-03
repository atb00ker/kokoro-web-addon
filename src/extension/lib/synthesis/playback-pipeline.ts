import type { PlaybackController } from "../audio/playback-controller";
import type { ExtensionSettings } from "../settings";
import { isValidWavBase64, mergeWavSlices, type WavSlice } from "./merge-wav-chunks";
import { cancelSynthesis, createRequestId, synthesize, type HostMessage } from "./native-messaging";
import { getChunkSynthesisContent } from "./synthesis-text";
import { splitIntoTextChunks } from "./text-chunker";

export interface PlaybackPipelineCallbacks {
  onPartPlaying?: (index: number, total: number) => void;
  onProgress?: (message: string) => void;
  onComplete?: () => void;
  onError?: (message: string) => void;
}

interface PlaybackPipelineOptions {
  text: string;
  chunks?: string[];
  settings: ExtensionSettings;
  player: PlaybackController;
  callbacks?: PlaybackPipelineCallbacks;
}

interface PartInfo {
  text: string;
  audio: string | null;
}

interface InflightRequest {
  requestId: string;
  index: number;
  slices: WavSlice[];
}

/**
 * Drives text-to-speech playback as two independent loops over an ordered list
 * of parts:
 *
 * - The synthesis loop keeps exactly one native request in flight, walking
 *   forward from the synthesis cursor and caching finished audio.
 * - The playback loop is event-driven: it plays the part at the playhead as
 *   soon as that part has audio, then advances when the player reports the
 *   segment ended.
 *
 * The two loops never block each other. Synthesis runs ahead as fast as the
 * host allows while playback follows the audio that has actually been heard.
 */
export class PlaybackPipeline {
  readonly sessionId: string;
  readonly totalParts: number;

  private readonly parts: PartInfo[];
  private readonly player: PlaybackController;
  private readonly settings: ExtensionSettings;
  private readonly callbacks: PlaybackPipelineCallbacks;

  private playhead = 0;
  private synthCursor = 0;
  private inflight: InflightRequest | null = null;
  private segmentOpen = false;
  private epoch = 0;

  private cancelled = false;
  private finished = false;

  private unsubscribeSegmentPlayback: (() => void) | null = null;
  private unsubscribeSegmentEnded: (() => void) | null = null;
  private unsubscribePlayerState: (() => void) | null = null;

  constructor(options: PlaybackPipelineOptions) {
    this.sessionId = createRequestId();
    this.player = options.player;
    this.settings = options.settings;
    this.callbacks = options.callbacks ?? {};

    const texts = options.chunks ?? splitIntoTextChunks(options.text);
    this.parts = texts.map((text) => ({ text, audio: null }));
    this.totalParts = this.parts.length;
  }

  get isActive(): boolean {
    return !this.cancelled && !this.finished;
  }

  ownsRequestId(requestId: string): boolean {
    return this.inflight?.requestId === requestId;
  }

  start(): void {
    if (this.totalParts === 0) {
      this.callbacks.onError?.("Text input is empty");
      return;
    }

    this.unsubscribeSegmentPlayback = this.player.onSegmentPlayback((index) => {
      if (!this.cancelled && !this.finished) {
        this.callbacks.onPartPlaying?.(index, this.totalParts);
      }
    });

    this.unsubscribeSegmentEnded = this.player.onSegmentEnded((index) => {
      this.handleSegmentEnded(index);
    });

    this.unsubscribePlayerState = this.player.onStateChange((state) => {
      if (state === "stopped" && this.playhead >= this.totalParts) {
        this.finalizePlayback();
      }
    });

    void this.player.play();
    this.pumpSynthesis();
  }

  cancel(): void {
    if (this.cancelled) {
      return;
    }

    this.cancelled = true;
    this.epoch += 1;
    this.teardownListeners();
    this.cancelInflight();
  }

  jumpTo(targetIndex: number): void {
    if (this.cancelled || this.finished) {
      return;
    }
    if (targetIndex < 0 || targetIndex >= this.totalParts) {
      return;
    }

    this.epoch += 1;
    const epoch = this.epoch;

    this.playhead = targetIndex;
    this.segmentOpen = false;

    const nextSynthIndex = this.firstUnsynthesizedFrom(targetIndex);
    if (this.inflight && this.inflight.index !== nextSynthIndex) {
      this.cancelInflight();
    }
    this.synthCursor = targetIndex;

    void (async () => {
      await this.player.abortScheduledPlayback();
      if (epoch !== this.epoch) {
        return;
      }
      this.pumpSynthesis();
      await this.tryPlay();
    })();
  }

  handleHostMessage(message: HostMessage): boolean {
    const requestId = "requestId" in message ? message.requestId : undefined;
    if (!requestId || !this.ownsRequestId(requestId)) {
      return false;
    }

    if (this.cancelled) {
      return true;
    }

    if (message.type === "progress") {
      this.callbacks.onProgress?.(this.formatPreparingMessage(this.inflight!.index));
      return true;
    }

    if (message.type === "audio_chunk") {
      this.inflight!.slices.push({ data: message.data });
      return true;
    }

    if (message.type === "complete") {
      this.handleComplete();
      return true;
    }

    if (message.type === "cancelled") {
      return true;
    }

    if (message.type === "error") {
      this.handleError(message.message);
      return true;
    }

    return false;
  }

  private handleComplete(): void {
    const inflight = this.inflight;
    if (!inflight) {
      return;
    }

    const index = inflight.index;
    this.inflight = null;

    if (inflight.slices.length > 0) {
      try {
        const merged = mergeWavSlices(inflight.slices);
        if (isValidWavBase64(merged)) {
          this.parts[index].audio = merged;
        } else {
          this.invalidatePartAudio(index);
        }
      } catch {
        this.invalidatePartAudio(index);
      }
    } else {
      this.invalidatePartAudio(index);
    }

    this.pumpSynthesis();
    void this.tryPlay();
  }

  private handleSegmentEnded(index: number): void {
    if (this.cancelled || this.finished) {
      return;
    }
    if (index !== this.playhead || !this.segmentOpen) {
      return;
    }

    this.segmentOpen = false;
    this.playhead += 1;
    void this.tryPlay();
    this.checkFinished();
  }

  /**
   * Plays the part at the playhead if its audio is ready and no segment is
   * currently open. Safe to call repeatedly; it is the single entry point that
   * drives playback forward.
   */
  private async tryPlay(): Promise<void> {
    if (this.cancelled || this.finished || this.segmentOpen) {
      return;
    }
    if (this.playhead >= this.totalParts) {
      this.checkFinished();
      return;
    }

    const audio = this.parts[this.playhead].audio;
    if (!audio) {
      return;
    }

    if (!isValidWavBase64(audio)) {
      this.invalidatePartAudio(this.playhead);
      this.pumpSynthesis();
      return;
    }

    const epoch = this.epoch;
    const segmentIndex = this.playhead;
    this.segmentOpen = true;

    await this.player.beginSegment(segmentIndex, segmentIndex < this.totalParts - 1);
    if (epoch !== this.epoch) {
      return;
    }

    await this.player.addChunk(audio, true);
    if (epoch !== this.epoch) {
      return;
    }
  }

  /**
   * Dispatches the next part that still needs audio, keeping one request in
   * flight. Parts that already have cached audio are skipped.
   */
  private pumpSynthesis(): void {
    if (this.cancelled || this.inflight) {
      return;
    }

    const index = this.firstUnsynthesizedFrom(this.synthCursor);
    this.synthCursor = index;
    if (index >= this.totalParts) {
      return;
    }

    const requestId = createRequestId();
    this.inflight = { requestId, index, slices: [] };

    synthesize({
      requestId,
      content: getChunkSynthesisContent(
        this.parts[index].text,
        this.settings.synthesisPrefix,
        index,
      ),
      options: {
        voice: this.settings.voice,
        speed: this.settings.speed,
        lang: this.settings.lang,
        format: this.settings.format,
      },
    });
  }

  private firstUnsynthesizedFrom(start: number): number {
    let index = start;
    while (index < this.totalParts) {
      const audio = this.parts[index].audio;
      if (audio === null) {
        break;
      }
      if (!isValidWavBase64(audio)) {
        this.parts[index].audio = null;
        break;
      }
      index += 1;
    }
    return index;
  }

  private invalidatePartAudio(index: number): void {
    this.parts[index].audio = null;
    this.synthCursor = Math.min(this.synthCursor, index);
  }

  private cancelInflight(): void {
    if (this.inflight) {
      cancelSynthesis(this.inflight.requestId);
      this.inflight = null;
    }
  }

  private checkFinished(): void {
    if (this.finished || this.cancelled) {
      return;
    }
    if (this.playhead < this.totalParts) {
      return;
    }

    const state = this.player.getState();
    if (state === "stopped" || state === "idle") {
      this.finalizePlayback();
    }
  }

  private finalizePlayback(): void {
    if (this.finished || this.cancelled) {
      return;
    }

    this.finished = true;
    this.teardownListeners();
    this.cancelInflight();
    this.callbacks.onComplete?.();
  }

  private handleError(message: string): void {
    if (this.cancelled) {
      return;
    }

    this.cancelled = true;
    this.epoch += 1;
    this.teardownListeners();
    this.cancelInflight();
    this.callbacks.onError?.(message);
  }

  private teardownListeners(): void {
    this.unsubscribeSegmentPlayback?.();
    this.unsubscribeSegmentPlayback = null;
    this.unsubscribeSegmentEnded?.();
    this.unsubscribeSegmentEnded = null;
    this.unsubscribePlayerState?.();
    this.unsubscribePlayerState = null;
  }

  private formatPreparingMessage(index: number): string {
    return this.totalParts > 1
      ? `Preparing ${index + 1} of ${this.totalParts}...`
      : "Sending request to kokoro-tts...";
  }
}
