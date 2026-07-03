import type { PlayerState } from "./audio-player";

export interface PlaybackController {
  beginSegment(segmentIndex: number, expectingMore: boolean): Promise<void>;
  addChunk(base64Data: string, final: boolean): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  resume(): Promise<void>;
  stop(): void;
  abortScheduledPlayback(): Promise<void>;
  getState(): PlayerState;
  onStateChange(listener: (state: PlayerState) => void): () => void;
  onSegmentPlayback(listener: (segmentIndex: number) => void): () => void;
  onSegmentEnded(listener: (segmentIndex: number) => void): () => void;
  preparePlayback?(): Promise<void>;
}
