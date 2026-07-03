import { describe, expect, test } from "bun:test";
import { getChunkSynthesisContent } from "./synthesis-text";

describe("getChunkSynthesisContent", () => {
  test("returns text unchanged when prefix is empty", () => {
    expect(getChunkSynthesisContent("hello", "", 0)).toBe("hello");
    expect(getChunkSynthesisContent("hello", "", 1)).toBe("hello");
  });

  test("prepends prefix only for the first chunk", () => {
    expect(getChunkSynthesisContent("hello", "padding. ", 0)).toBe("padding. hello");
    expect(getChunkSynthesisContent("hello", "padding. ", 1)).toBe("hello");
    expect(getChunkSynthesisContent("hello", "padding. ", 2)).toBe("hello");
  });
});
