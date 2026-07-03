import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import * as actualSettings from "./settings";

const playerStopMock = mock(() => {});
const playerGetStateMock = mock(() => "idle");

const defaultSettings = {
  kokoroPath: "kokoro-tts",
  modelDir: "~/.kokoro",
  voice: "am_adam",
  speed: 1,
  lang: "en-us",
  format: "wav",
  synthesisPrefix: "",
};

mock.module("./audio/offscreen-playback", () => ({
  createPlaybackController: () => ({
    stop: playerStopMock,
    getState: playerGetStateMock,
    onStateChange: () => () => {},
    preparePlayback: async () => {},
  }),
}));

mock.module("./synthesis/native-messaging", () => ({
  onHostMessage: () => () => {},
  setHostConfig: async () => {},
  cancelSynthesis: () => {},
  synthesize: () => {},
  createRequestId: () => "req-test",
}));

mock.module("./synthesis/playback-pipeline", () => ({
  PlaybackPipeline: class {
    sessionId = "test-session";
    totalParts = 1;
    isActive = true;

    start(): void {}

    cancel(): void {}

    jumpTo(): void {}

    handleHostMessage(): void {}
  },
}));

mock.module("./settings", () => ({
  getSettings: async () => defaultSettings,
  updateSettings: async () => defaultSettings,
  sanitizeSettings: actualSettings.sanitizeSettings,
  sanitizeSettingsPartial: actualSettings.sanitizeSettingsPartial,
}));

const sessionManager = await import("./session-manager");

afterAll(() => {
  mock.restore();
});

describe("session-manager", () => {
  beforeEach(() => {
    playerStopMock.mockClear();
    sessionManager.stopPlayback();
    sessionManager.clearReadAlongContent();
  });

  test("jumpToChunk returns error when no active session", () => {
    const result = sessionManager.jumpToChunk(0);
    expect(result).toEqual({ ok: false, error: "No active session" });
  });

  test("replayReadAlong returns error when read-along is empty", async () => {
    const result = await sessionManager.replayReadAlong();
    expect(result).toEqual({ ok: false, error: "No text to replay" });
  });

  test("setCachedSettings is accepted without throwing", () => {
    sessionManager.setCachedSettings({
      kokoroPath: "kokoro-tts",
      modelDir: "~/.kokoro",
      voice: "am_adam",
      speed: 1,
      lang: "en-us",
      format: "wav",
      synthesisPrefix: "",
    });
    expect(sessionManager.getSession().status).toBe("idle");
  });

  test("stopPlayback resets session state", () => {
    sessionManager.stopPlayback();
    expect(sessionManager.getSession()).toEqual({
      requestId: null,
      status: "idle",
      statusMessage: "Ready",
      error: null,
    });
    expect(playerStopMock).toHaveBeenCalled();
  });

  test("stopPlayback preserves read-along text", async () => {
    await sessionManager.startSynthesis({ content: "hello world" });
    expect(sessionManager.getReadAlong().chunks.length).toBeGreaterThan(0);

    sessionManager.stopPlayback();

    expect(sessionManager.getSession()).toEqual({
      requestId: null,
      status: "idle",
      statusMessage: "Ready",
      error: null,
    });
    expect(sessionManager.getReadAlong().chunks.length).toBeGreaterThan(0);
    expect(sessionManager.getReadAlong().activeChunkIndex).toBeNull();
    expect(playerStopMock).toHaveBeenCalled();
  });

  test("clearReadAlongContent removes read-along text", async () => {
    await sessionManager.startSynthesis({ content: "hello world" });
    expect(sessionManager.getReadAlong().chunks.length).toBeGreaterThan(0);

    sessionManager.clearReadAlongContent();

    expect(sessionManager.getReadAlong()).toEqual({
      chunks: [],
      activeChunkIndex: null,
    });
    expect(sessionManager.getSession()).toEqual({
      requestId: null,
      status: "idle",
      statusMessage: "Ready",
      error: null,
    });
  });
});
