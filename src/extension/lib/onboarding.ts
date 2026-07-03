export const KOKORO_TTS_URL = "https://github.com/nazdridoy/kokoro-tts";

export const ONBOARDING_TITLE = "One-time setup required on your computer";
export const ONBOARDING_BODY =
  "This extension uses kokoro-tts on your machine. Install kokoro-tts and the model files first, " +
  "then register the browser bridge. Restart your browser when finished.";

export const ONBOARDING_STEP_KOKORO = "Step 1 — Install kokoro-tts";
export const ONBOARDING_STEP_BRIDGE = "Step 2 — Connect this extension";

export function getCustomPathsHint(surface: "popup" | "options"): string {
  if (surface === "options") {
    return (
      "If kokoro-tts is not on your PATH, or your model files are in a custom folder, " +
      "set the binary and model directory in Advanced paths below."
    );
  }

  return (
    "If kokoro-tts is not on your PATH, or your model files are in a custom folder, " +
    "open Settings to set a custom binary path and model directory."
  );
}

export function getKokoroInstallCommand(): string {
  return [
    "uv tool install kokoro-tts",
    "",
    "mkdir -p ~/.kokoro && cd ~/.kokoro",
    "wget https://github.com/nazdridoy/kokoro-tts/releases/download/v1.0.0/voices-v1.0.bin",
    "wget https://github.com/nazdridoy/kokoro-tts/releases/download/v1.0.0/kokoro-v1.0.onnx",
  ].join("\n");
}

export function getSetupCommand(): string {
  return "pip install kokoro-web && kokoro-web-setup";
}

export function isHostSetupComplete(response: {
  ok?: boolean;
  hostConnected?: boolean;
  kokoroReady?: boolean;
}): boolean {
  return Boolean(response.ok && response.hostConnected && response.kokoroReady);
}
