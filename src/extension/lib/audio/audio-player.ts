export type PlayerState = "idle" | "buffering" | "playing" | "paused" | "stopped";

type StateListener = (state: PlayerState) => void;
type SegmentPlaybackListener = (segmentIndex: number) => void;
type SegmentEndedListener = (segmentIndex: number) => void;

export function shouldNotifySegmentStart(currentTime: number, startAt: number): boolean {
  return currentTime >= startAt;
}

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private scheduledSources: AudioBufferSourceNode[] = [];
  private chunkQueue: ArrayBuffer[] = [];
  private nextStartTime = 0;
  private state: PlayerState = "idle";
  private listeners = new Set<StateListener>();
  private segmentPlaybackListeners = new Set<SegmentPlaybackListener>();
  private segmentEndedListeners = new Set<SegmentEndedListener>();
  private currentSegmentIndex: number | null = null;
  private segmentStartTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private notifiedSegmentStarts = new Set<number>();
  private segmentFirstBufferScheduled = new Set<number>();
  private segmentBufferCounts = new Map<number, number>();
  private wavDataChunks: Uint8Array[] = [];
  private awaitingHeader = true;
  private sampleRate = 24000;
  private expectMoreSegments = false;
  private playbackGeneration = 0;

  beginSegment(segmentIndex: number, expectingMore: boolean): void {
    this.currentSegmentIndex = segmentIndex;
    this.expectMoreSegments = expectingMore;
    this.awaitingHeader = true;
    this.wavDataChunks = [];
    this.segmentFirstBufferScheduled.delete(segmentIndex);
    this.notifiedSegmentStarts.delete(segmentIndex);
    this.segmentBufferCounts.delete(segmentIndex);
  }

  onStateChange(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  onSegmentPlayback(listener: SegmentPlaybackListener): () => void {
    this.segmentPlaybackListeners.add(listener);
    return () => this.segmentPlaybackListeners.delete(listener);
  }

  onSegmentEnded(listener: SegmentEndedListener): () => void {
    this.segmentEndedListeners.add(listener);
    return () => this.segmentEndedListeners.delete(listener);
  }

  getState(): PlayerState {
    return this.state;
  }

  private setState(next: PlayerState): void {
    this.state = next;
    for (const listener of this.listeners) {
      listener(next);
    }
  }

  private async ensureContext(): Promise<AudioContext> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
    }

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    return this.audioContext;
  }

  async prepare(): Promise<void> {
    await this.ensureContext();
  }

  async addChunk(base64Data: string, final: boolean): Promise<void> {
    const bytes = Uint8Array.from(atob(base64Data), (char) => char.charCodeAt(0));

    if (this.state === "idle" || this.state === "stopped") {
      this.setState("buffering");
    }

    if (this.awaitingHeader) {
      this.wavDataChunks.push(bytes);
      const combined = this.concatChunks(this.wavDataChunks);
      const parsed = this.tryParseWavHeader(combined);

      if (!parsed) {
        if (final) {
          throw new Error("Received invalid WAV data from native host");
        }
        return;
      }

      this.sampleRate = parsed.sampleRate;
      this.awaitingHeader = false;

      if (parsed.audioData.byteLength > 0) {
        const audioData = new Uint8Array(parsed.audioData);
        this.chunkQueue.push(audioData.buffer);
      }

      this.wavDataChunks = [];
    } else {
      this.chunkQueue.push(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      );
    }

    if (this.state === "buffering" || this.state === "playing") {
      await this.scheduleQueuedChunks();
    }

    if (final && this.chunkQueue.length === 0 && this.scheduledSources.length === 0) {
      if (this.expectMoreSegments) {
        this.awaitingHeader = true;
        this.wavDataChunks = [];
      } else {
        this.setState("stopped");
      }
    }
  }

  async play(): Promise<void> {
    await this.ensureContext();
    await this.scheduleQueuedChunks();
    this.setState("playing");
  }

  pause(): void {
    if (!this.audioContext) {
      return;
    }

    void this.audioContext.suspend();
    this.setState("paused");
  }

  async resume(): Promise<void> {
    await this.ensureContext();
    await this.scheduleQueuedChunks();
    this.setState("playing");
  }

  abortScheduledPlayback(): void {
    this.playbackGeneration += 1;
    this.clearAllSegmentStartNotifiers();

    for (const source of this.scheduledSources) {
      try {
        source.stop();
      } catch {
        // Source may already be stopped.
      }
    }

    this.scheduledSources = [];
    this.chunkQueue = [];
    this.wavDataChunks = [];
    this.awaitingHeader = true;
    this.expectMoreSegments = false;
    this.currentSegmentIndex = null;
    this.notifiedSegmentStarts.clear();
    this.segmentFirstBufferScheduled.clear();
    this.segmentBufferCounts.clear();

    if (this.audioContext) {
      this.nextStartTime = this.audioContext.currentTime + 0.05;
    } else {
      this.nextStartTime = 0;
    }

    if (this.state === "playing") {
      this.setState("buffering");
    }
  }

  stop(): void {
    this.playbackGeneration += 1;
    this.clearAllSegmentStartNotifiers();

    for (const source of this.scheduledSources) {
      try {
        source.stop();
      } catch {
        // Source may already be stopped.
      }
    }

    this.scheduledSources = [];
    this.chunkQueue = [];
    this.wavDataChunks = [];
    this.awaitingHeader = true;
    this.expectMoreSegments = false;
    this.currentSegmentIndex = null;
    this.notifiedSegmentStarts.clear();
    this.segmentFirstBufferScheduled.clear();
    this.segmentBufferCounts.clear();
    this.nextStartTime = 0;

    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
      this.gainNode = null;
    }

    this.setState("stopped");
  }

  private concatChunks(chunks: Uint8Array[]): Uint8Array {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Uint8Array(total);
    let offset = 0;

    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    return combined;
  }

  private tryParseWavHeader(
    bytes: Uint8Array,
  ): { header: ArrayBuffer; audioData: Uint8Array; sampleRate: number } | null {
    if (bytes.byteLength < 44) {
      return null;
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const riff = String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3),
    );
    const wave = String.fromCharCode(
      view.getUint8(8),
      view.getUint8(9),
      view.getUint8(10),
      view.getUint8(11),
    );

    if (riff !== "RIFF" || wave !== "WAVE") {
      return null;
    }

    let offset = 12;
    let dataOffset = -1;
    let dataSize = 0;
    let sampleRate = 24000;

    while (offset + 8 <= bytes.byteLength) {
      const chunkId = String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3),
      );
      const chunkSize = view.getUint32(offset + 4, true);
      const chunkStart = offset + 8;

      if (chunkId === "fmt " && chunkSize >= 16) {
        sampleRate = view.getUint32(chunkStart + 4, true);
      }

      if (chunkId === "data") {
        dataOffset = chunkStart;
        dataSize = chunkSize;
        break;
      }

      offset = chunkStart + chunkSize + (chunkSize % 2);
    }

    if (dataOffset < 0) {
      return null;
    }

    const headerEnd = dataOffset;
    const header = bytes.slice(0, headerEnd).buffer;
    const audioData = bytes.slice(dataOffset, dataOffset + dataSize);

    return { header, audioData, sampleRate };
  }

  private pcm16ToAudioBuffer(context: AudioContext, pcm: Uint8Array): AudioBuffer {
    const sampleCount = pcm.byteLength / 2;
    const buffer = context.createBuffer(1, sampleCount, this.sampleRate);
    const channel = buffer.getChannelData(0);
    const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);

    for (let index = 0; index < sampleCount; index += 1) {
      const sample = view.getInt16(index * 2, true);
      channel[index] = sample / 32768;
    }

    return buffer;
  }

  private clearAllSegmentStartNotifiers(): void {
    for (const timer of this.segmentStartTimers.values()) {
      clearTimeout(timer);
    }
    this.segmentStartTimers.clear();
  }

  private registerSegmentStartNotify(segmentIndex: number, startAt: number): void {
    if (this.notifiedSegmentStarts.has(segmentIndex)) {
      return;
    }

    const poll = (): void => {
      const context = this.audioContext;
      if (!context) {
        return;
      }

      if (shouldNotifySegmentStart(context.currentTime, startAt)) {
        this.segmentStartTimers.delete(segmentIndex);
        if (!this.notifiedSegmentStarts.has(segmentIndex)) {
          this.notifiedSegmentStarts.add(segmentIndex);
          for (const listener of this.segmentPlaybackListeners) {
            listener(segmentIndex);
          }
        }
        return;
      }

      this.segmentStartTimers.set(segmentIndex, setTimeout(poll, 50));
    };

    poll();
  }

  private notifySegmentEnded(segmentIndex: number): void {
    for (const listener of this.segmentEndedListeners) {
      listener(segmentIndex);
    }
  }

  private async scheduleQueuedChunks(): Promise<void> {
    const context = await this.ensureContext();
    if (!this.gainNode) {
      return;
    }

    const now = context.currentTime;

    if (this.nextStartTime < now) {
      this.nextStartTime = now + 0.05;
    }

    while (this.chunkQueue.length > 0) {
      const chunk = this.chunkQueue.shift();
      if (!chunk) {
        break;
      }

      const pcm = new Uint8Array(chunk);
      const audioBuffer = this.pcm16ToAudioBuffer(context, pcm);
      const source = context.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.gainNode);

      const startAt = this.nextStartTime;
      source.start(startAt);

      const segmentIndex = this.currentSegmentIndex;
      if (segmentIndex !== null && !this.segmentFirstBufferScheduled.has(segmentIndex)) {
        this.segmentFirstBufferScheduled.add(segmentIndex);
        this.registerSegmentStartNotify(segmentIndex, startAt);
      }

      if (segmentIndex !== null) {
        this.segmentBufferCounts.set(
          segmentIndex,
          (this.segmentBufferCounts.get(segmentIndex) ?? 0) + 1,
        );
      }

      const endedSegmentIndex = segmentIndex;
      const generation = this.playbackGeneration;
      source.onended = () => {
        this.scheduledSources = this.scheduledSources.filter((item) => item !== source);
        if (generation !== this.playbackGeneration) {
          if (
            this.scheduledSources.length === 0 &&
            this.chunkQueue.length === 0 &&
            this.state === "playing" &&
            !this.expectMoreSegments
          ) {
            this.setState("stopped");
          }
          return;
        }
        if (endedSegmentIndex !== null) {
          const remaining = (this.segmentBufferCounts.get(endedSegmentIndex) ?? 0) - 1;
          if (remaining <= 0) {
            this.segmentBufferCounts.delete(endedSegmentIndex);
            this.notifySegmentEnded(endedSegmentIndex);
          } else {
            this.segmentBufferCounts.set(endedSegmentIndex, remaining);
          }
        }
        if (
          this.scheduledSources.length === 0 &&
          this.chunkQueue.length === 0 &&
          this.state === "playing" &&
          !this.expectMoreSegments
        ) {
          this.setState("stopped");
        }
      };

      this.scheduledSources.push(source);
      this.nextStartTime += audioBuffer.duration;
    }

    if (this.state === "buffering") {
      this.setState("playing");
    }
  }
}
