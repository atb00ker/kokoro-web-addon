import { AudioPlayer } from "./audio-player";
import type { PlaybackController } from "./playback-controller";

export class LocalPlaybackController implements PlaybackController {
  private readonly player = new AudioPlayer();

  async beginSegment(segmentIndex: number, expectingMore: boolean): Promise<void> {
    this.player.beginSegment(segmentIndex, expectingMore);
  }

  addChunk(base64Data: string, final: boolean): Promise<void> {
    return this.player.addChunk(base64Data, final);
  }

  play(): Promise<void> {
    return this.player.play();
  }

  pause(): void {
    this.player.pause();
  }

  resume(): Promise<void> {
    return this.player.resume();
  }

  stop(): void {
    this.player.stop();
  }

  async abortScheduledPlayback(): Promise<void> {
    this.player.abortScheduledPlayback();
  }

  getState() {
    return this.player.getState();
  }

  onStateChange(listener: (state: ReturnType<AudioPlayer["getState"]>) => void): () => void {
    return this.player.onStateChange(listener);
  }

  onSegmentPlayback(listener: (segmentIndex: number) => void): () => void {
    return this.player.onSegmentPlayback(listener);
  }

  onSegmentEnded(listener: (segmentIndex: number) => void): () => void {
    return this.player.onSegmentEnded(listener);
  }

  async preparePlayback(): Promise<void> {
    await this.player.prepare();
  }
}
