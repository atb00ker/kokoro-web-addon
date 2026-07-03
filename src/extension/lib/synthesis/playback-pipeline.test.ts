import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { PlayerState } from "../audio/audio-player";
import type { PlaybackController } from "../audio/playback-controller";
import type { ExtensionSettings } from "../settings";
import { createTestWav, mergeWavSlices } from "./merge-wav-chunks";
import type { SynthesizeRequest } from "./native-messaging";
import type { PlaybackPipelineCallbacks } from "./playback-pipeline";

const synthesizeMock = mock<(request: SynthesizeRequest) => void>(() => {});
const cancelSynthesisMock = mock<(requestId: string) => void>(() => {});
let requestCounter = 0;

mock.module("./native-messaging", () => ({
  synthesize: synthesizeMock,
  cancelSynthesis: cancelSynthesisMock,
  createRequestId: () => `req-${++requestCounter}`,
}));

mock.module("./text-chunker", () => ({
  splitIntoTextChunks: (text: string) => text.split("|"),
}));

const { PlaybackPipeline } = await import("./playback-pipeline");

afterAll(() => {
  mock.restore();
});

const defaultSettings: ExtensionSettings = {
  voice: "am_adam",
  speed: 1,
  lang: "en-us",
  format: "wav",
  kokoroPath: "kokoro-tts",
  modelDir: "~/.kokoro",
  synthesisPrefix: "",
};

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function partAudio(index: number): string {
  return createTestWav(100 + index * 10);
}

function mergedPartAudio(index: number): string {
  return mergeWavSlices([{ data: partAudio(index) }]);
}

interface MockPlayer extends PlaybackController {
  beginSegmentCalls: Array<[number, boolean]>;
  addChunkCalls: Array<[string, boolean]>;
  fireStart: (index: number) => void;
  fireEnded: (index: number) => void;
  setState: (state: PlayerState) => void;
}

function createMockPlayer(): MockPlayer {
  let state: PlayerState = "playing";
  let startListener: ((index: number) => void) | null = null;
  let endedListener: ((index: number) => void) | null = null;
  let stateListener: ((state: PlayerState) => void) | null = null;

  const beginSegmentCalls: Array<[number, boolean]> = [];
  const addChunkCalls: Array<[string, boolean]> = [];

  return {
    beginSegmentCalls,
    addChunkCalls,
    play: mock(async () => {}),
    beginSegment: mock(async (index: number, expectingMore: boolean) => {
      beginSegmentCalls.push([index, expectingMore]);
    }),
    addChunk: mock(async (data: string, final: boolean) => {
      addChunkCalls.push([data, final]);
    }),
    abortScheduledPlayback: mock(async () => {}),
    pause: mock(() => {}),
    resume: mock(async () => {}),
    stop: mock(() => {
      state = "stopped";
    }),
    getState: () => state,
    onSegmentPlayback: (listener) => {
      startListener = listener;
      return () => {
        startListener = null;
      };
    },
    onSegmentEnded: (listener) => {
      endedListener = listener;
      return () => {
        endedListener = null;
      };
    },
    onStateChange: (listener) => {
      stateListener = listener;
      return () => {
        stateListener = null;
      };
    },
    fireStart: (index: number) => startListener?.(index),
    fireEnded: (index: number) => endedListener?.(index),
    setState: (next: PlayerState) => {
      state = next;
      stateListener?.(next);
    },
  } as MockPlayer;
}

function currentRequestId(): string {
  const calls = synthesizeMock.mock.calls;
  return calls[calls.length - 1]![0].requestId;
}

function synthesizedContents(): string[] {
  return synthesizeMock.mock.calls.map((call) => call[0].content);
}

async function completeCurrent(
  pipeline: InstanceType<typeof PlaybackPipeline>,
  index: number,
): Promise<void> {
  const requestId = currentRequestId();
  pipeline.handleHostMessage({
    type: "audio_chunk",
    requestId,
    index: 0,
    data: partAudio(index),
    final: true,
  });
  pipeline.handleHostMessage({ type: "complete", requestId });
  await tick();
}

function createPipeline(
  text: string,
  player: MockPlayer,
  callbacks?: PlaybackPipelineCallbacks,
): InstanceType<typeof PlaybackPipeline> {
  return new PlaybackPipeline({
    text,
    settings: defaultSettings,
    player,
    callbacks,
  });
}

beforeEach(() => {
  synthesizeMock.mockClear();
  cancelSynthesisMock.mockClear();
  requestCounter = 0;
});

describe("PlaybackPipeline synthesis loop", () => {
  test("synthesizes parts sequentially n, n+1, n+2", async () => {
    const player = createMockPlayer();
    const pipeline = createPipeline("a|b|c", player);

    pipeline.start();
    expect(synthesizedContents()).toEqual(["a"]);

    await completeCurrent(pipeline, 0);
    expect(synthesizedContents()).toEqual(["a", "b"]);

    await completeCurrent(pipeline, 1);
    expect(synthesizedContents()).toEqual(["a", "b", "c"]);

    await completeCurrent(pipeline, 2);
    expect(synthesizedContents()).toEqual(["a", "b", "c"]);
  });

  test("keeps only one synthesis request in flight at a time", async () => {
    const player = createMockPlayer();
    const pipeline = createPipeline("a|b|c", player);

    pipeline.start();
    expect(synthesizeMock).toHaveBeenCalledTimes(1);

    await tick();
    expect(synthesizeMock).toHaveBeenCalledTimes(1);
  });
});

describe("PlaybackPipeline playback loop", () => {
  test("plays a part as soon as its audio is ready", async () => {
    const player = createMockPlayer();
    const pipeline = createPipeline("a|b", player);

    pipeline.start();
    await completeCurrent(pipeline, 0);

    expect(player.beginSegmentCalls).toEqual([[0, true]]);
    expect(player.addChunkCalls).toEqual([[mergedPartAudio(0), true]]);
  });

  test("highlight follows the audio, not synthesis", async () => {
    const player = createMockPlayer();
    const playing: number[] = [];
    const pipeline = createPipeline("a|b|c", player, {
      onPartPlaying: (index) => playing.push(index),
    });

    pipeline.start();
    await completeCurrent(pipeline, 0);
    await completeCurrent(pipeline, 1);
    await completeCurrent(pipeline, 2);

    expect(playing).toEqual([]);

    player.fireStart(0);
    expect(playing).toEqual([0]);
  });

  test("advances immediately when the next part is already synthesized", async () => {
    const player = createMockPlayer();
    const pipeline = createPipeline("a|b", player);

    pipeline.start();
    await completeCurrent(pipeline, 0);
    await completeCurrent(pipeline, 1);

    player.fireEnded(0);
    await tick();

    expect(player.beginSegmentCalls).toEqual([
      [0, true],
      [1, false],
    ]);
  });

  test("waits for synthesis when the next part is not ready, then resumes", async () => {
    const player = createMockPlayer();
    const pipeline = createPipeline("a|b", player);

    pipeline.start();
    await completeCurrent(pipeline, 0);

    player.fireEnded(0);
    await tick();
    expect(player.beginSegmentCalls).toEqual([[0, true]]);

    await completeCurrent(pipeline, 1);
    expect(player.beginSegmentCalls).toEqual([
      [0, true],
      [1, false],
    ]);
  });

  test("fires onComplete after the final part ends and the player stops", async () => {
    const player = createMockPlayer();
    const onComplete = mock(() => {});
    const pipeline = createPipeline("a|b", player, { onComplete });

    pipeline.start();
    await completeCurrent(pipeline, 0);
    await completeCurrent(pipeline, 1);

    player.fireEnded(0);
    await tick();
    player.fireEnded(1);
    await tick();

    player.setState("stopped");
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe("PlaybackPipeline jump", () => {
  test("cancels in-flight synthesis and restarts at the jump target", async () => {
    const player = createMockPlayer();
    const pipeline = createPipeline("a|b|c|d|e", player);

    pipeline.start();
    await completeCurrent(pipeline, 0);
    expect(synthesizedContents()).toEqual(["a", "b"]);

    pipeline.jumpTo(3);
    await tick();

    expect(cancelSynthesisMock).toHaveBeenCalledTimes(1);
    expect(synthesizedContents()).toEqual(["a", "b", "d"]);

    await completeCurrent(pipeline, 3);
    expect(player.beginSegmentCalls.at(-1)).toEqual([3, true]);
    expect(synthesizedContents()).toEqual(["a", "b", "d", "e"]);
  });

  test("reuses cached audio and keeps a still-useful in-flight request", async () => {
    const player = createMockPlayer();
    const pipeline = createPipeline("a|b|c|d", player);

    pipeline.start();
    await completeCurrent(pipeline, 0);
    await completeCurrent(pipeline, 1);
    expect(synthesizedContents()).toEqual(["a", "b", "c"]);

    const callsBeforeJump = synthesizeMock.mock.calls.length;
    pipeline.jumpTo(0);
    await tick();

    expect(cancelSynthesisMock).not.toHaveBeenCalled();
    expect(synthesizeMock.mock.calls.length).toBe(callsBeforeJump);
    expect(player.beginSegmentCalls.at(-1)).toEqual([0, true]);
    expect(player.addChunkCalls.at(-1)).toEqual([mergedPartAudio(0), true]);
  });
});

describe("PlaybackPipeline lifecycle", () => {
  test("cancel stops the in-flight synthesis and deactivates the pipeline", () => {
    const player = createMockPlayer();
    const pipeline = createPipeline("a|b", player);

    pipeline.start();
    expect(pipeline.isActive).toBe(true);

    pipeline.cancel();
    expect(cancelSynthesisMock).toHaveBeenCalledTimes(1);
    expect(pipeline.isActive).toBe(false);
  });

  test("propagates synthesis errors", () => {
    const player = createMockPlayer();
    const onError = mock(() => {});
    const pipeline = createPipeline("a|b", player, { onError });

    pipeline.start();
    pipeline.handleHostMessage({
      type: "error",
      requestId: currentRequestId(),
      message: "boom",
    });

    expect(onError).toHaveBeenCalledWith("boom");
    expect(pipeline.isActive).toBe(false);
  });

  test("reports preparing progress with 1-based numbers", () => {
    const player = createMockPlayer();
    const messages: string[] = [];
    const pipeline = createPipeline("a|b|c", player, {
      onProgress: (message) => messages.push(message),
    });

    pipeline.start();
    pipeline.handleHostMessage({
      type: "progress",
      requestId: currentRequestId(),
      message: "ignored",
    });

    expect(messages).toEqual(["Preparing 1 of 3..."]);
  });

  test("re-synthesizes when cached audio is invalid", async () => {
    const player = createMockPlayer();
    const pipeline = createPipeline("a|b", player);

    pipeline.start();
    await completeCurrent(pipeline, 0);
    const callsBeforeCorruption = synthesizeMock.mock.calls.length;

    const parts = (pipeline as unknown as { parts: Array<{ audio: string | null }> }).parts;
    parts[0]!.audio = btoa("not-a-valid-wav");

    pipeline.jumpTo(0);
    await tick();

    expect(synthesizeMock.mock.calls.length).toBeGreaterThan(callsBeforeCorruption);
    expect(synthesizedContents().at(-1)).toBe("a");
  });

  test("re-synthesizes when synthesis completes with invalid audio", async () => {
    const player = createMockPlayer();
    const pipeline = createPipeline("a|b", player);

    pipeline.start();
    const requestId = currentRequestId();
    pipeline.handleHostMessage({
      type: "audio_chunk",
      requestId,
      index: 0,
      data: btoa("bad"),
      final: true,
    });
    pipeline.handleHostMessage({ type: "complete", requestId });
    await tick();

    expect(synthesizedContents()).toEqual(["a", "a"]);
  });
});
