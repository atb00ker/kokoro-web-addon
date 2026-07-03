import { describe, expect, test } from "bun:test";
import { EMPTY_READ_ALONG } from "./read-along/read-along";
import {
  formatChunkStatusMessage,
  hasReadAlongText,
  isActiveReadAlongSession,
  isPlaybackActive,
} from "./extension-state";

describe("hasReadAlongText", () => {
  test("returns false for empty chunks", () => {
    expect(hasReadAlongText(EMPTY_READ_ALONG)).toBe(false);
  });

  test("returns true when chunks exist", () => {
    expect(hasReadAlongText({ ...EMPTY_READ_ALONG, chunks: ["hello"] })).toBe(true);
  });
});

describe("isPlaybackActive", () => {
  test("is true when session is playing", () => {
    expect(
      isPlaybackActive(
        { requestId: "1", status: "playing", statusMessage: "", error: null },
        "idle",
      ),
    ).toBe(true);
  });

  test("is true when player is buffering", () => {
    expect(
      isPlaybackActive(
        { requestId: null, status: "idle", statusMessage: "", error: null },
        "buffering",
      ),
    ).toBe(true);
  });
});

describe("isActiveReadAlongSession", () => {
  test("requires read-along text and in-progress session status", () => {
    expect(
      isActiveReadAlongSession(
        { requestId: "1", status: "playing", statusMessage: "", error: null },
        { ...EMPTY_READ_ALONG, chunks: ["one"] },
      ),
    ).toBe(true);

    expect(
      isActiveReadAlongSession(
        { requestId: null, status: "idle", statusMessage: "", error: null },
        { ...EMPTY_READ_ALONG, chunks: ["one"] },
      ),
    ).toBe(false);
  });
});

describe("formatChunkStatusMessage", () => {
  test("formats multi-part playback status", () => {
    expect(formatChunkStatusMessage(0, 3)).toBe("Playing 1 of 3...");
    expect(formatChunkStatusMessage(2, 3)).toBe("Playing 3 of 3...");
  });

  test("uses generic message for single part", () => {
    expect(formatChunkStatusMessage(0, 1)).toBe("Playing audio...");
  });
});
