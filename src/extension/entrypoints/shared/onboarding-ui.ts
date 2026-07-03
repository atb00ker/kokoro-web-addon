import {
  getCustomPathsHint,
  getKokoroInstallCommand,
  getSetupCommand,
  isHostSetupComplete,
  KOKORO_TTS_URL,
  ONBOARDING_BODY,
  ONBOARDING_STEP_BRIDGE,
  ONBOARDING_STEP_KOKORO,
  ONBOARDING_TITLE,
} from "../../lib/onboarding";
import type { ExtensionSettings } from "../../lib/settings";
import { setStatus } from "./ui";

export interface OnboardingElements {
  title: HTMLElement;
  body: HTMLElement;
  pathsHint: HTMLElement;
  stepKokoro: HTMLElement;
  stepBridge: HTMLElement;
  docsLink: HTMLAnchorElement;
  installCommand: HTMLElement;
  setupCommand: HTMLElement;
  copyKokoroBtn: HTMLButtonElement;
  copySetupBtn: HTMLButtonElement;
}

export interface HostCheckResponse {
  ok?: boolean;
  hostConnected?: boolean;
  kokoroReady?: boolean;
  message?: string | null;
  error?: string;
  settings?: ExtensionSettings;
}

export interface CheckHostConnectionOptions {
  surface: "popup" | "options";
  showCheckingStatus?: boolean;
  onSetupStateChange: (ready: boolean) => void;
  onSettingsReceived?: (settings: ExtensionSettings) => void;
  onAdvancedSettingsOpen?: (open: boolean) => void;
}

export function populateOnboardingContent(
  elements: OnboardingElements,
  surface: "popup" | "options",
): void {
  elements.title.textContent = ONBOARDING_TITLE;
  elements.body.textContent = ONBOARDING_BODY;
  elements.stepKokoro.textContent = ONBOARDING_STEP_KOKORO;
  elements.stepBridge.textContent = ONBOARDING_STEP_BRIDGE;
  elements.docsLink.href = KOKORO_TTS_URL;
  elements.installCommand.textContent = getKokoroInstallCommand();
  elements.pathsHint.textContent = getCustomPathsHint(surface);
  elements.setupCommand.textContent = getSetupCommand();
}

export function wireOnboardingCopyButtons(
  elements: OnboardingElements,
  statusEl: HTMLElement,
): void {
  elements.copyKokoroBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(getKokoroInstallCommand());
      setStatus(statusEl, "Kokoro install commands copied.", "success");
    } catch {
      setStatus(statusEl, "Could not copy to clipboard.", "error");
    }
  });

  elements.copySetupBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(getSetupCommand());
      setStatus(statusEl, "Bridge setup command copied.", "success");
    } catch {
      setStatus(statusEl, "Could not copy to clipboard.", "error");
    }
  });
}

export async function checkHostConnection(
  statusEl: HTMLElement,
  options: CheckHostConnectionOptions,
): Promise<boolean> {
  if (options.showCheckingStatus) {
    setStatus(statusEl, "Testing connection...");
  }

  const response = (await browser.runtime.sendMessage({
    type: "CHECK_HOST",
  })) as HostCheckResponse;

  const hostConnected = Boolean(response?.hostConnected);
  const kokoroReady = Boolean(response?.kokoroReady);
  const setupComplete = isHostSetupComplete(response);

  options.onSetupStateChange(setupComplete);
  options.onAdvancedSettingsOpen?.(!setupComplete);

  if (options.surface === "options") {
    if (!response?.ok || !hostConnected) {
      setStatus(
        statusEl,
        response?.error ??
          "Bridge not installed. Complete the setup steps above and restart the browser.",
        "error",
      );
      return false;
    }

    if (!response.kokoroReady) {
      setStatus(
        statusEl,
        response.message ?? "Bridge connected, but kokoro-tts or models were not found.",
        "warning",
      );
      if (response.settings) {
        options.onSettingsReceived?.(response.settings);
      }
      return false;
    }

    if (response.settings) {
      options.onSettingsReceived?.(response.settings);
    }

    setStatus(statusEl, "Connected to kokoro-tts.", "success");
    return true;
  }

  if (setupComplete) {
    setStatus(statusEl, "Ready");
    return true;
  }

  if (hostConnected && !kokoroReady) {
    setStatus(
      statusEl,
      response.message ?? "Bridge connected, but kokoro-tts or model files were not found.",
      "error",
    );
    return false;
  }

  setStatus(
    statusEl,
    "Complete the setup steps below, restart the browser, then test again.",
    "error",
  );
  return false;
}
