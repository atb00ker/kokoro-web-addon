import { describe, expect, test } from "bun:test";
import { handleExtensionMessage } from "./message-handlers";
import type { PlaybackController } from "./audio/playback-controller";

const player = {
  beginSegment: async () => {},
  addChunk: async () => {},
  play: async () => {},
  pause: () => {},
  resume: async () => {},
  stop: () => {},
  abortScheduledPlayback: async () => {},
  getState: () => "idle" as const,
  onStateChange: () => () => {},
  onSegmentPlayback: () => () => {},
  onSegmentEnded: () => () => {},
} satisfies PlaybackController;

describe("handleExtensionMessage", () => {
  test("rejects invalid synthesis payloads", async () => {
    const response = await handleExtensionMessage(
      { type: "START_SYNTHESIS", content: 1 },
      {
        player,
      },
    );
    expect(response).toEqual({ ok: false, error: "Invalid synthesis content" });
  });

  test("rejects unknown message types", async () => {
    const response = await handleExtensionMessage({ type: "NOT_A_REAL_MESSAGE" }, { player });
    expect(response).toEqual({ ok: false, error: "Unknown message type" });
  });
});
