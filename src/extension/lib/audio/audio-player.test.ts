import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { AudioPlayer, shouldNotifySegmentStart } from "./audio-player";
import { createTestWav } from "../synthesis/merge-wav-chunks";

function createPlayerWithMockContext(currentTime: number): {
  player: AudioPlayer;
  setCurrentTime: (value: number) => void;
} {
  const player = new AudioPlayer();
  let time = currentTime;

  const mockContext = {
    get currentTime() {
      return time;
    },
    state: "running" as AudioContextState,
    destination: {},
    resume: async () => {},
    close: async () => {},
    createGain: () => ({
      connect: () => {},
    }),
    createBuffer: (_channels: number, length: number, sampleRate: number) => ({
      duration: length / sampleRate,
      getChannelData: () => new Float32Array(length),
    }),
    createBufferSource: () => {
      const source = {
        buffer: null as AudioBuffer | null,
        onended: null as (() => void) | null,
        connect: () => {},
        start: () => {},
      };
      return source;
    },
  } as unknown as AudioContext;

  (player as unknown as { audioContext: AudioContext | null }).audioContext = mockContext;

  return {
    player,
    setCurrentTime: (value: number) => {
      time = value;
    },
  };
}

function attachGainNode(player: AudioPlayer): void {
  const context = (player as unknown as { audioContext: AudioContext }).audioContext;
  (player as unknown as { gainNode: GainNode }).gainNode = context.createGain() as GainNode;
}

function registerSegmentStart(player: AudioPlayer, segmentIndex: number, startAt: number): void {
  (
    player as unknown as {
      registerSegmentStartNotify: (index: number, startAt: number) => void;
    }
  ).registerSegmentStartNotify(segmentIndex, startAt);
}

describe("shouldNotifySegmentStart", () => {
  test("returns false before scheduled start time", () => {
    expect(shouldNotifySegmentStart(0, 0.05)).toBe(false);
    expect(shouldNotifySegmentStart(29.9, 30)).toBe(false);
  });

  test("returns true at or after scheduled start time", () => {
    expect(shouldNotifySegmentStart(0.05, 0.05)).toBe(true);
    expect(shouldNotifySegmentStart(30, 30)).toBe(true);
    expect(shouldNotifySegmentStart(31, 30)).toBe(true);
  });
});

describe("AudioPlayer segment start notifications", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("notifies listeners once per segment as playback time advances", () => {
    const { player, setCurrentTime } = createPlayerWithMockContext(0);
    const notified: number[] = [];

    player.onSegmentPlayback((index) => {
      notified.push(index);
    });

    registerSegmentStart(player, 0, 0.05);
    registerSegmentStart(player, 1, 30);
    registerSegmentStart(player, 2, 60);

    setCurrentTime(0.05);
    jest.advanceTimersByTime(50);
    expect(notified).toEqual([0]);

    setCurrentTime(30);
    jest.advanceTimersByTime(50);
    expect(notified).toEqual([0, 1]);

    setCurrentTime(60);
    jest.advanceTimersByTime(50);
    expect(notified).toEqual([0, 1, 2]);
  });

  test("notifies for a late segment registered after earlier segments", () => {
    const { player, setCurrentTime } = createPlayerWithMockContext(0);
    const notified: number[] = [];

    player.onSegmentPlayback((index) => {
      notified.push(index);
    });

    registerSegmentStart(player, 0, 0.05);
    registerSegmentStart(player, 1, 30);

    setCurrentTime(0.05);
    jest.advanceTimersByTime(50);
    expect(notified).toEqual([0]);

    setCurrentTime(30);
    jest.advanceTimersByTime(50);
    expect(notified).toEqual([0, 1]);

    registerSegmentStart(player, 2, 90);

    setCurrentTime(90);
    jest.advanceTimersByTime(50);
    expect(notified).toEqual([0, 1, 2]);
  });

  test("does not cancel an earlier segment notifier when a later segment is registered", () => {
    const { player, setCurrentTime } = createPlayerWithMockContext(0);
    const notified: number[] = [];

    player.onSegmentPlayback((index) => {
      notified.push(index);
    });

    registerSegmentStart(player, 1, 30);
    registerSegmentStart(player, 2, 60);

    setCurrentTime(30);
    jest.advanceTimersByTime(50);
    expect(notified).toEqual([1]);

    setCurrentTime(60);
    jest.advanceTimersByTime(50);
    expect(notified).toEqual([1, 2]);
  });

  test("notifies each segment index only once", () => {
    const { player, setCurrentTime } = createPlayerWithMockContext(0);
    const notified: number[] = [];

    player.onSegmentPlayback((index) => {
      notified.push(index);
    });

    registerSegmentStart(player, 0, 0.05);
    setCurrentTime(0.05);
    jest.advanceTimersByTime(50);
    registerSegmentStart(player, 0, 0.05);
    jest.advanceTimersByTime(100);

    expect(notified).toEqual([0]);
  });

  test("clears pending notifiers on stop", () => {
    const { player, setCurrentTime } = createPlayerWithMockContext(0);
    const notified: number[] = [];

    player.onSegmentPlayback((index) => {
      notified.push(index);
    });

    registerSegmentStart(player, 1, 30);
    registerSegmentStart(player, 2, 60);
    player.stop();

    setCurrentTime(30);
    jest.advanceTimersByTime(100);
    setCurrentTime(60);
    jest.advanceTimersByTime(100);

    expect(notified).toEqual([]);
  });
});

describe("AudioPlayer.abortScheduledPlayback", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("clears scheduled playback without stopping the player", () => {
    const { player } = createPlayerWithMockContext(10);
    const notified: number[] = [];

    player.onSegmentPlayback((index) => {
      notified.push(index);
    });

    (
      player as unknown as {
        scheduledSources: unknown[];
        segmentStartTimers: Map<number, ReturnType<typeof setTimeout>>;
        state: string;
      }
    ).scheduledSources.push({});
    registerSegmentStart(player, 1, 30);
    (player as unknown as { state: string }).state = "playing";

    player.abortScheduledPlayback();

    expect(player.getState()).toBe("buffering");
    expect((player as unknown as { scheduledSources: unknown[] }).scheduledSources).toEqual([]);
    expect(
      (player as unknown as { segmentStartTimers: Map<number, unknown> }).segmentStartTimers.size,
    ).toBe(0);
    expect(
      (player as unknown as { notifiedSegmentStarts: Set<number> }).notifiedSegmentStarts.size,
    ).toBe(0);

    jest.advanceTimersByTime(100);
    expect(notified).toEqual([]);
  });

  test("preserves audio context unlike stop", () => {
    const { player } = createPlayerWithMockContext(5);
    (player as unknown as { state: string }).state = "paused";

    player.abortScheduledPlayback();

    expect(
      (player as unknown as { audioContext: AudioContext | null }).audioContext,
    ).not.toBeNull();
    expect(player.getState()).toBe("paused");
  });

  test("does not transition to stopped when aborted sources end", () => {
    const { player } = createPlayerWithMockContext(10);
    const states: string[] = [];

    player.onStateChange((state) => {
      states.push(state);
    });

    (player as unknown as { state: string }).state = "playing";
    (player as unknown as { scheduledSources: unknown[] }).scheduledSources.push({});

    player.abortScheduledPlayback();

    expect(player.getState()).toBe("buffering");
    expect(states).toContain("buffering");
    expect(states).not.toContain("stopped");
  });
});

describe("AudioPlayer segment end notifications", () => {
  test("notifies when the last scheduled buffer for a segment ends", async () => {
    const { player } = createPlayerWithMockContext(0);
    attachGainNode(player);
    const ended: number[] = [];
    const sources: Array<{ onended: (() => void) | null }> = [];

    (player as unknown as { audioContext: AudioContext }).audioContext.createBufferSource = () => {
      const source = {
        buffer: null as AudioBuffer | null,
        onended: null as (() => void) | null,
        connect: () => {},
        start: () => {},
      };
      sources.push(source);
      return source as unknown as AudioBufferSourceNode;
    };

    player.onSegmentEnded((index) => {
      ended.push(index);
    });

    player.beginSegment(0, true);
    await player.addChunk(createTestWav(64), true);

    expect(sources).toHaveLength(1);
    sources[0]?.onended?.();
    expect(ended).toEqual([0]);
  });

  test("does not notify segment end until all segment buffers finish", async () => {
    const { player } = createPlayerWithMockContext(0);
    attachGainNode(player);
    const ended: number[] = [];
    const sources: Array<{ onended: (() => void) | null }> = [];

    (player as unknown as { audioContext: AudioContext }).audioContext.createBufferSource = () => {
      const source = {
        buffer: null as AudioBuffer | null,
        onended: null as (() => void) | null,
        connect: () => {},
        start: () => {},
      };
      sources.push(source);
      return source as unknown as AudioBufferSourceNode;
    };

    player.onSegmentEnded((index) => {
      ended.push(index);
    });

    player.beginSegment(0, true);
    await player.addChunk(createTestWav(64), false);
    await player.addChunk(createTestWav(64), true);

    expect(sources).toHaveLength(2);
    sources[0]?.onended?.();
    expect(ended).toEqual([]);

    sources[1]?.onended?.();
    expect(ended).toEqual([0]);
  });
});
