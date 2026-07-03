import { describe, expect, test } from "bun:test";
import { sanitizeSettings, sanitizeSettingsPartial } from "./settings";

describe("sanitizeSettingsPartial", () => {
  test("clamps speed", () => {
    expect(sanitizeSettingsPartial({ speed: 0.1 })).toEqual({
      speed: 0.5,
    });
  });

  test("ignores blank path updates", () => {
    expect(sanitizeSettingsPartial({ kokoroPath: "   " })).toEqual({});
  });

  test("ignores removed parallel synthesis fields", () => {
    expect(sanitizeSettingsPartial({ concurrentSynthesis: true, maxParallelChunks: 99 })).toEqual(
      {},
    );
  });
});

describe("sanitizeSettings", () => {
  test("fills defaults for missing values", () => {
    const settings = sanitizeSettings(undefined);
    expect(settings.voice).toBe("am_adam");
    expect(settings.speed).toBe(1);
    expect(settings.format).toBe("wav");
  });

  test("trims strings and clamps numeric fields", () => {
    const settings = sanitizeSettings({
      kokoroPath: "  /usr/bin/kokoro-tts  ",
      modelDir: "",
      speed: 4,
    });

    expect(settings.kokoroPath).toBe("/usr/bin/kokoro-tts");
    expect(settings.modelDir.length).toBeGreaterThan(0);
    expect(settings.speed).toBe(2);
  });
});
