import {
  getDefaultKokoroPath,
  getDefaultModelDir,
  getDefaultOpenSidebarShortcut,
  getSuggestedKokoroPaths,
} from "../../lib/defaults";
import { formatError } from "../../lib/format-error";
import {
  canCustomizeSidebarShortcut,
  clearOpenSidebarShortcut,
  formatShortcutFromKeyboardEvent,
  getOpenSidebarShortcut,
  isSidebarAvailable,
  openExtensionShortcutSettings,
  setOpenSidebarShortcut,
} from "../../lib/sidebar";
import {
  checkHostConnection,
  populateOnboardingContent,
  wireOnboardingCopyButtons,
  type OnboardingElements,
} from "../shared/onboarding-ui";
import { populateLanguages, populateVoices, setStatus, wireTtsControls } from "../shared/ui";

const kokoroPathInput = document.querySelector<HTMLInputElement>("#kokoro-path")!;
const modelDirInput = document.querySelector<HTMLInputElement>("#model-dir")!;
const langSelect = document.querySelector<HTMLSelectElement>("#lang-select")!;
const voiceSelect = document.querySelector<HTMLSelectElement>("#voice-select")!;
const speedRange = document.querySelector<HTMLInputElement>("#speed-range")!;
const speedValue = document.querySelector<HTMLElement>("#speed-value")!;
const synthesisPrefixInput = document.querySelector<HTMLInputElement>("#synthesis-prefix")!;
const kokoroSuggestions = document.querySelector<HTMLElement>("#kokoro-suggestions")!;
const saveBtn = document.querySelector<HTMLButtonElement>("#save-btn")!;
const savePlaybackBtn = document.querySelector<HTMLButtonElement>("#save-playback-btn")!;
const testBtn = document.querySelector<HTMLButtonElement>("#test-btn")!;
const statusEl = document.querySelector<HTMLParagraphElement>("#status")!;

function showError(error: unknown): void {
  setStatus(statusEl, formatError(error), "error");
}

const onboardingEl = document.querySelector<HTMLElement>("#onboarding")!;
const onboardingTitle = document.querySelector<HTMLElement>("#onboarding-title")!;
const onboardingBody = document.querySelector<HTMLElement>("#onboarding-body")!;
const onboardingPathsHint = document.querySelector<HTMLElement>("#onboarding-paths-hint")!;
const onboardingStepKokoro = document.querySelector<HTMLElement>("#onboarding-step-kokoro")!;
const onboardingStepBridge = document.querySelector<HTMLElement>("#onboarding-step-bridge")!;
const kokoroDocsLink = document.querySelector<HTMLAnchorElement>("#kokoro-docs-link")!;
const kokoroInstallCommandEl = document.querySelector<HTMLElement>("#kokoro-install-command")!;
const setupCommandEl = document.querySelector<HTMLElement>("#setup-command")!;
const copySetupBtn = document.querySelector<HTMLButtonElement>("#copy-setup-btn")!;
const copyKokoroBtn = document.querySelector<HTMLButtonElement>("#copy-kokoro-btn")!;
const keyboardShortcutsEl = document.querySelector<HTMLElement>("#keyboard-shortcuts")!;
const shortcutCustomizeActions = document.querySelector<HTMLElement>(
  "#shortcut-customize-actions",
)!;
const sidebarShortcutDisplay = document.querySelector<HTMLElement>("#sidebar-shortcut-display")!;
const recordShortcutBtn = document.querySelector<HTMLButtonElement>("#record-shortcut-btn")!;
const resetShortcutBtn = document.querySelector<HTMLButtonElement>("#reset-shortcut-btn")!;
const clearShortcutBtn = document.querySelector<HTMLButtonElement>("#clear-shortcut-btn")!;
const firefoxShortcutsLink = document.querySelector<HTMLAnchorElement>("#firefox-shortcuts-link")!;
const chromeShortcutsLink = document.querySelector<HTMLAnchorElement>("#chrome-shortcuts-link")!;

const onboardingElements: OnboardingElements = {
  title: onboardingTitle,
  body: onboardingBody,
  pathsHint: onboardingPathsHint,
  stepKokoro: onboardingStepKokoro,
  stepBridge: onboardingStepBridge,
  docsLink: kokoroDocsLink,
  installCommand: kokoroInstallCommandEl,
  setupCommand: setupCommandEl,
  copyKokoroBtn,
  copySetupBtn,
};

let recordingShortcut = false;
let shortcutCaptureHandler: ((event: KeyboardEvent) => void) | null = null;

function showOnboarding(show: boolean): void {
  onboardingEl.classList.toggle("hidden", !show);
}

async function runHostCheck(): Promise<void> {
  await checkHostConnection(statusEl, {
    surface: "options",
    showCheckingStatus: true,
    onSetupStateChange: (ready) => showOnboarding(!ready),
    onAdvancedSettingsOpen: (open) => {
      document
        .querySelector<HTMLDetailsElement>("#advanced-settings")
        ?.toggleAttribute("open", open);
    },
    onSettingsReceived: (settings) => {
      kokoroPathInput.value = settings.kokoroPath;
      modelDirInput.value = settings.modelDir;
    },
  });
}

async function refreshSidebarShortcutDisplay(): Promise<void> {
  const shortcut = await getOpenSidebarShortcut();
  sidebarShortcutDisplay.textContent = shortcut || "None";
}

function stopShortcutCapture(): void {
  if (shortcutCaptureHandler) {
    document.removeEventListener("keydown", shortcutCaptureHandler, true);
    shortcutCaptureHandler = null;
  }
  recordingShortcut = false;
  recordShortcutBtn.textContent = "Record shortcut";
  recordShortcutBtn.classList.remove("recording");
}

function startShortcutCapture(): void {
  if (recordingShortcut) {
    stopShortcutCapture();
    return;
  }

  recordingShortcut = true;
  recordShortcutBtn.textContent = "Press keys… (Esc to cancel)";
  recordShortcutBtn.classList.add("recording");
  setStatus(statusEl, "Press the key combination you want to use.");

  shortcutCaptureHandler = (event: KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      stopShortcutCapture();
      setStatus(statusEl, "Shortcut capture cancelled.");
      return;
    }

    const shortcut = formatShortcutFromKeyboardEvent(event);
    if (!shortcut) {
      return;
    }

    stopShortcutCapture();
    void (async () => {
      try {
        await setOpenSidebarShortcut(shortcut);
        await refreshSidebarShortcutDisplay();
        setStatus(statusEl, `Shortcut set to ${shortcut}.`, "success");
      } catch (error) {
        showError(error);
      }
    })();
  };

  document.addEventListener("keydown", shortcutCaptureHandler, true);
}

function initKeyboardShortcutsSection(): void {
  const commandsAvailable = typeof browser.commands?.getAll === "function";

  if (!isSidebarAvailable() || !commandsAvailable) {
    keyboardShortcutsEl.classList.add("hidden");
    return;
  }

  const canCustomize = canCustomizeSidebarShortcut();
  shortcutCustomizeActions.classList.toggle("hidden", !canCustomize);
  firefoxShortcutsLink.classList.toggle("hidden", !canCustomize);
  chromeShortcutsLink.classList.toggle("hidden", canCustomize);

  void refreshSidebarShortcutDisplay();
}

async function loadSettings(): Promise<void> {
  populateOnboardingContent(onboardingElements, "options");

  const response = await browser.runtime.sendMessage({ type: "GET_STATE" });
  kokoroPathInput.value = response.settings.kokoroPath || getDefaultKokoroPath();
  modelDirInput.value = response.settings.modelDir || getDefaultModelDir();
  kokoroSuggestions.textContent = `Suggested: ${getSuggestedKokoroPaths().join(", ")}`;
  populateLanguages(langSelect, response.settings.lang);
  populateVoices(voiceSelect, response.settings.lang, response.settings.voice);
  speedRange.value = String(response.settings.speed);
  speedValue.textContent = response.settings.speed.toFixed(1);
  synthesisPrefixInput.value = response.settings.synthesisPrefix ?? "";

  initKeyboardShortcutsSection();
  await runHostCheck();
}

async function savePathSettings(): Promise<void> {
  const response = await browser.runtime.sendMessage({
    type: "SAVE_SETTINGS",
    settings: {
      kokoroPath: kokoroPathInput.value.trim() || getDefaultKokoroPath(),
      modelDir: modelDirInput.value.trim() || getDefaultModelDir(),
      synthesisPrefix: synthesisPrefixInput.value,
    },
  });

  if (!response?.ok) {
    setStatus(statusEl, response?.error ?? "Failed to save settings", "error");
    return;
  }

  await runHostCheck();
}

async function savePlaybackDefaults(): Promise<void> {
  const response = await browser.runtime.sendMessage({
    type: "SAVE_SETTINGS",
    settings: {
      lang: langSelect.value,
      voice: voiceSelect.value,
      speed: Number(speedRange.value),
    },
  });

  if (!response?.ok) {
    setStatus(statusEl, response?.error ?? "Failed to save playback defaults", "error");
    return;
  }

  setStatus(statusEl, "Playback defaults saved.", "success");
}

wireTtsControls({
  langSelect,
  voiceSelect,
  speedRange,
  speedValue,
  persist: "manual",
});

wireOnboardingCopyButtons(onboardingElements, statusEl);

saveBtn.addEventListener("click", () => {
  void savePathSettings();
});

savePlaybackBtn.addEventListener("click", () => {
  void savePlaybackDefaults();
});

testBtn.addEventListener("click", () => {
  void runHostCheck();
});

recordShortcutBtn.addEventListener("click", () => {
  startShortcutCapture();
});

resetShortcutBtn.addEventListener("click", () => {
  void (async () => {
    try {
      const shortcut = getDefaultOpenSidebarShortcut();
      await setOpenSidebarShortcut(shortcut);
      await refreshSidebarShortcutDisplay();
      setStatus(statusEl, `Shortcut reset to ${shortcut}.`, "success");
    } catch (error) {
      showError(error);
    }
  })();
});

clearShortcutBtn.addEventListener("click", () => {
  void (async () => {
    try {
      await clearOpenSidebarShortcut();
      await refreshSidebarShortcutDisplay();
      setStatus(statusEl, "Shortcut cleared.", "success");
    } catch (error) {
      showError(error);
    }
  })();
});

function openShortcutSettingsFromLink(event: Event): void {
  event.preventDefault();
  void openExtensionShortcutSettings().catch(showError);
}

firefoxShortcutsLink.addEventListener("click", openShortcutSettingsFromLink);
chromeShortcutsLink.addEventListener("click", openShortcutSettingsFromLink);

void loadSettings();
