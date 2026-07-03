import { describe, expect, test } from "bun:test";
import { createTestWav, isValidWavBase64, mergeWavSlices } from "./merge-wav-chunks";

function decodeBase64(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function pcmLengthFromWavBase64(base64: string): number {
  const bytes = decodeBase64(base64);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(40, true);
}

describe("mergeWavSlices", () => {
  test("returns equivalent WAV for a single slice", () => {
    const wav = createTestWav(512);
    const merged = mergeWavSlices([{ data: wav }]);
    expect(pcmLengthFromWavBase64(merged)).toBe(512);
  });

  test("merges multi-slice host chunks into one WAV with full PCM length", () => {
    const wav = createTestWav(1200);
    const bytes = decodeBase64(wav);
    const sliceA = btoa(String.fromCharCode(...bytes.slice(0, 600)));
    const sliceB = btoa(String.fromCharCode(...bytes.slice(600)));

    const merged = mergeWavSlices([{ data: sliceA }, { data: sliceB }]);
    expect(pcmLengthFromWavBase64(merged)).toBe(1200);
  });

  test("merges slices where the first slice alone is too short for a header", () => {
    const wav = createTestWav(800);
    const bytes = decodeBase64(wav);
    const sliceA = btoa(String.fromCharCode(...bytes.slice(0, 20)));
    const sliceB = btoa(String.fromCharCode(...bytes.slice(20)));

    const merged = mergeWavSlices([{ data: sliceA }, { data: sliceB }]);
    expect(pcmLengthFromWavBase64(merged)).toBe(800);
  });

  test("throws when given no slices", () => {
    expect(() => mergeWavSlices([])).toThrow("Cannot merge empty WAV slices");
  });
});

describe("isValidWavBase64", () => {
  test("accepts valid merged WAV data", () => {
    expect(isValidWavBase64(createTestWav(512))).toBe(true);
  });

  test("rejects empty, truncated, and garbage data", () => {
    expect(isValidWavBase64("")).toBe(false);
    expect(isValidWavBase64(btoa("short"))).toBe(false);
    expect(isValidWavBase64(btoa("not-a-valid-wav"))).toBe(false);
  });
});
