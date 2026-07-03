import {
  DEFAULT_FORMAT,
  DEFAULT_LANG,
  DEFAULT_SPEED,
  DEFAULT_SYNTHESIS_PREFIX,
  DEFAULT_VOICE,
  getDefaultKokoroPath,
  getDefaultModelDir,
} from "./defaults";

export interface ExtensionSettings {
  kokoroPath: string;
  modelDir: string;
  voice: string;
  speed: number;
  lang: string;
  format: "wav";
  synthesisPrefix: string;
}

const SETTINGS_STORAGE_KEY = "kokoroSettings";

const MIN_SPEED = 0.5;
const MAX_SPEED = 2.0;

function clampSpeed(value: number): number {
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, value));
}

function trimPath(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export function sanitizeSettingsPartial(
  partial: Record<string, unknown>,
): Partial<ExtensionSettings> {
  const next: Partial<ExtensionSettings> = {};

  if ("kokoroPath" in partial) {
    const path = typeof partial.kokoroPath === "string" ? partial.kokoroPath.trim() : "";
    if (path) {
      next.kokoroPath = path;
    }
  }

  if ("modelDir" in partial) {
    const dir = typeof partial.modelDir === "string" ? partial.modelDir.trim() : "";
    if (dir) {
      next.modelDir = dir;
    }
  }

  if (typeof partial.voice === "string" && partial.voice.trim()) {
    next.voice = partial.voice.trim();
  }

  if (typeof partial.speed === "number") {
    next.speed = clampSpeed(partial.speed);
  }

  if (typeof partial.lang === "string" && partial.lang.trim()) {
    next.lang = partial.lang.trim();
  }

  if (partial.format === "wav") {
    next.format = "wav";
  }

  if (typeof partial.synthesisPrefix === "string") {
    next.synthesisPrefix = partial.synthesisPrefix;
  }

  return next;
}

export function sanitizeSettings(
  partial: Partial<ExtensionSettings> | undefined,
): ExtensionSettings {
  const defaults: ExtensionSettings = {
    kokoroPath: getDefaultKokoroPath(),
    modelDir: getDefaultModelDir(),
    voice: DEFAULT_VOICE,
    speed: DEFAULT_SPEED,
    lang: DEFAULT_LANG,
    format: DEFAULT_FORMAT,
    synthesisPrefix: DEFAULT_SYNTHESIS_PREFIX,
  };

  if (!partial) {
    return defaults;
  }

  return {
    kokoroPath: trimPath(partial.kokoroPath, defaults.kokoroPath),
    modelDir: trimPath(partial.modelDir, defaults.modelDir),
    voice: partial.voice?.trim() || defaults.voice,
    speed: partial.speed !== undefined ? clampSpeed(partial.speed) : defaults.speed,
    lang: partial.lang?.trim() || defaults.lang,
    format: partial.format === "wav" ? "wav" : defaults.format,
    synthesisPrefix:
      partial.synthesisPrefix !== undefined ? partial.synthesisPrefix : defaults.synthesisPrefix,
  };
}

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await browser.storage.sync.get(SETTINGS_STORAGE_KEY);
  const current = stored[SETTINGS_STORAGE_KEY];
  return sanitizeSettings(
    typeof current === "object" && current !== null
      ? (current as Partial<ExtensionSettings>)
      : undefined,
  );
}

async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await browser.storage.sync.set({ [SETTINGS_STORAGE_KEY]: settings });
}

export async function updateSettings(
  partial: Partial<ExtensionSettings>,
): Promise<ExtensionSettings> {
  const current = await getSettings();
  const next = sanitizeSettings({
    ...current,
    ...sanitizeSettingsPartial(partial as Record<string, unknown>),
  });
  await saveSettings(next);
  return next;
}
