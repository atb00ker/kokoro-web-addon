import { describe, expect, test } from "bun:test";
import { MAX_SYNTHESIS_CONTENT_LENGTH, parseExtensionRequestMessage } from "./messages";

describe("parseExtensionRequestMessage", () => {
  test("accepts simple control messages", () => {
    expect(parseExtensionRequestMessage({ type: "GET_STATE" })).toEqual({
      ok: true,
      message: { type: "GET_STATE" },
    });
    expect(parseExtensionRequestMessage({ type: "STOP" })).toEqual({
      ok: true,
      message: { type: "STOP" },
    });
    expect(parseExtensionRequestMessage({ type: "CLEAR_READ_ALONG" })).toEqual({
      ok: true,
      message: { type: "CLEAR_READ_ALONG" },
    });
  });

  test("rejects unknown message types", () => {
    expect(parseExtensionRequestMessage({ type: "NOPE" })).toEqual({
      ok: false,
      error: "Unknown message type",
    });
  });

  test("validates synthesis content", () => {
    expect(parseExtensionRequestMessage({ type: "START_SYNTHESIS", content: 123 })).toEqual({
      ok: false,
      error: "Invalid synthesis content",
    });

    expect(
      parseExtensionRequestMessage({
        type: "START_SYNTHESIS",
        content: "a".repeat(MAX_SYNTHESIS_CONTENT_LENGTH + 1),
      }),
    ).toEqual({
      ok: false,
      error: "Invalid synthesis content",
    });

    expect(parseExtensionRequestMessage({ type: "START_SYNTHESIS", content: "hello" })).toEqual({
      ok: true,
      message: { type: "START_SYNTHESIS", content: "hello", options: undefined },
    });
  });

  test("sanitizes save settings payloads", () => {
    const parsed = parseExtensionRequestMessage({
      type: "SAVE_SETTINGS",
      settings: { speed: 9, kokoroPath: "  " },
    });

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.message).toEqual({
        type: "SAVE_SETTINGS",
        settings: { speed: 2 },
      });
    }
  });

  test("validates jump chunk index", () => {
    expect(parseExtensionRequestMessage({ type: "JUMP_TO_CHUNK", index: 1.5 })).toEqual({
      ok: false,
      error: "Invalid chunk index",
    });

    expect(parseExtensionRequestMessage({ type: "JUMP_TO_CHUNK", index: 2 })).toEqual({
      ok: true,
      message: { type: "JUMP_TO_CHUNK", index: 2 },
    });
  });
});
