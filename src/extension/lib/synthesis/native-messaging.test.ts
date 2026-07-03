import { describe, expect, test } from "bun:test";
import { parseHostMessage } from "./native-messaging";

describe("parseHostMessage", () => {
  test("parses pong responses", () => {
    expect(
      parseHostMessage({
        type: "pong",
        kokoroReady: true,
        message: "ready",
      }),
    ).toEqual({
      type: "pong",
      hostConnected: undefined,
      kokoroReady: true,
      kokoroPath: undefined,
      modelDir: undefined,
      message: "ready",
    });
  });

  test("parses streaming synthesis messages", () => {
    expect(
      parseHostMessage({
        type: "audio_chunk",
        requestId: "req-1",
        index: 0,
        data: "abc",
        final: false,
      }),
    ).toEqual({
      type: "audio_chunk",
      requestId: "req-1",
      index: 0,
      data: "abc",
      final: false,
    });
  });

  test("rejects malformed responses", () => {
    expect(() => parseHostMessage(null)).toThrow("Invalid native host response.");
    expect(() => parseHostMessage({ type: "audio_chunk", requestId: "x" })).toThrow(
      "Invalid audio_chunk response from native host.",
    );
  });
});
