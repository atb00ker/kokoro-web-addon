export const NATIVE_HOST_NAME = "com.kokoro.web";

type Platform = "linux" | "macos" | "windows" | "unknown";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") {
    return "unknown";
  }

  const platform = navigator.platform.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();

  if (platform.includes("win") || userAgent.includes("windows")) {
    return "windows";
  }

  if (platform.includes("mac") || userAgent.includes("macintosh")) {
    return "macos";
  }

  if (platform.includes("linux") || userAgent.includes("linux")) {
    return "linux";
  }

  return "unknown";
}

export function getDefaultKokoroPath(): string {
  switch (detectPlatform()) {
    case "windows":
      return "kokoro-tts.exe";
    default:
      return "kokoro-tts";
  }
}

export function getSuggestedKokoroPaths(): string[] {
  switch (detectPlatform()) {
    case "windows":
      return [
        "kokoro-tts.exe",
        "%APPDATA%\\Python\\Python312\\Scripts\\kokoro-tts.exe",
        "%APPDATA%\\Python\\Python311\\Scripts\\kokoro-tts.exe",
        "%LOCALAPPDATA%\\Programs\\Python\\Python312\\Scripts\\kokoro-tts.exe",
      ];
    case "macos":
      return [
        "kokoro-tts",
        "~/.local/bin/kokoro-tts",
        "/opt/homebrew/bin/kokoro-tts",
        "/usr/local/bin/kokoro-tts",
      ];
    default:
      return ["kokoro-tts", "~/.local/bin/kokoro-tts", "/usr/local/bin/kokoro-tts"];
  }
}

export function getDefaultModelDir(): string {
  switch (detectPlatform()) {
    case "windows":
      return "%USERPROFILE%\\.kokoro";
    default:
      return "~/.kokoro";
  }
}

export const DEFAULT_VOICE = "am_adam";
export const DEFAULT_SPEED = 1.0;
export const DEFAULT_LANG = "en-us";
export const DEFAULT_FORMAT = "wav" as const;
export const CHUNK_TARGET_MIN_WORDS = 40;
export const CHUNK_TARGET_MAX_WORDS = 80;
/** Word count for a hard cut when no sentence boundary exists in the target window. */
export const CHUNK_FALLBACK_CUT_WORDS = 60;
export const DEFAULT_SYNTHESIS_PREFIX = "";

export const OPEN_READ_ALONG_SIDEBAR_COMMAND = "open-read-along-sidebar";

const DEFAULT_OPEN_SIDEBAR_SHORTCUT = "Ctrl+Shift+K";

export const MANIFEST_FIREFOX_SIDEBAR_SHORTCUT_KEYS = {
  default: DEFAULT_OPEN_SIDEBAR_SHORTCUT,
  mac: DEFAULT_OPEN_SIDEBAR_SHORTCUT,
} as const;

export const MANIFEST_CHROME_SIDEBAR_SHORTCUT_KEYS = {
  default: DEFAULT_OPEN_SIDEBAR_SHORTCUT,
  linux: DEFAULT_OPEN_SIDEBAR_SHORTCUT,
  windows: DEFAULT_OPEN_SIDEBAR_SHORTCUT,
  mac: "Command+Shift+K",
} as const;

export function isChromeExtensionRuntime(): boolean {
  if (typeof browser === "undefined") {
    return false;
  }

  const id = browser.runtime.id;
  return id.length === 32 && /^[a-z]+$/.test(id);
}

export function getDefaultOpenSidebarShortcut(): string {
  return DEFAULT_OPEN_SIDEBAR_SHORTCUT;
}
