import { listenForHostSetupChanges, subscribeToExtensionState } from "../../lib/extension-client";
import { DEFAULT_FORMAT } from "../../lib/defaults";
import { hasReadAlongText, type StateUpdateMessage } from "../../lib/extension-state";
import { mountReadAlongView } from "../../lib/read-along/read-along-view";
import {
  getOpenSidebarShortcut,
  isSidebarAvailable,
  openReadAlongSidebar,
} from "../../lib/sidebar";
import type { PlayerState } from "../../lib/audio/audio-player";
import {
  checkHostConnection,
  populateOnboardingContent,
  wireOnboardingCopyButtons,
  type OnboardingElements,
} from "../shared/onboarding-ui";
import {
  applyReadAlongTransportState,
  createChunkClickHandler,
  populateLanguages,
  populateVoices,
  requestReadPage,
  setStatus,
  wireTransportControls,
  wireTtsControls,
} from "../shared/ui";

const onboardingEl = document.querySelector<HTMLElement>("#onboarding")!;
const onboardingTitle = document.querySelector<HTMLElement>("#onboarding-title")!;
const onboardingBody = document.querySelector<HTMLElement>("#onboarding-body")!;
const onboardingPathsHint = document.querySelector<HTMLElement>("#onboarding-paths-hint")!;
const onboardingStepKokoro = document.querySelector<HTMLElement>("#onboarding-step-kokoro")!;
const onboardingStepBridge = document.querySelector<HTMLElement>("#onboarding-step-bridge")!;
const kokoroDocsLink = document.querySelector<HTMLAnchorElement>("#kokoro-docs-link")!;
const kokoroInstallCommandEl = document.querySelector<HTMLElement>("#kokoro-install-command")!;
const setupCommandEl = document.querySelector<HTMLElement>("#setup-command")!;
const copyKokoroBtn = document.querySelector<HTMLButtonElement>("#copy-kokoro-btn")!;
const copySetupBtn = document.querySelector<HTMLButtonElement>("#copy-setup-btn")!;
const retrySetupBtn = document.querySelector<HTMLButtonElement>("#retry-setup-btn")!;
const openSettingsBtn = document.querySelector<HTMLButtonElement>("#open-settings-btn")!;
const mainContent = document.querySelector<HTMLElement>("#main-content")!;
const textInput = document.querySelector<HTMLTextAreaElement>("#text-input")!;
const readPageBtn = document.querySelector<HTMLButtonElement>("#read-page-btn")!;
const readAlongContainer = document.querySelector<HTMLElement>("#read-along-view")!;
const langSelect = document.querySelector<HTMLSelectElement>("#lang-select")!;
const voiceSelect = document.querySelector<HTMLSelectElement>("#voice-select")!;
const speedRange = document.querySelector<HTMLInputElement>("#speed-range")!;
const speedValue = document.querySelector<HTMLElement>("#speed-value")!;
const playBtn = document.querySelector<HTMLButtonElement>("#play-btn")!;
const pauseBtn = document.querySelector<HTMLButtonElement>("#pause-btn")!;
const stopBtn = document.querySelector<HTMLButtonElement>("#stop-btn")!;
const statusEl = document.querySelector<HTMLParagraphElement>("#status")!;
const openOptions = document.querySelector<HTMLAnchorElement>("#open-options")!;
const pinSidebarBtn = document.querySelector<HTMLButtonElement>("#pin-sidebar-btn")!;
const pinSidebarHint = document.querySelector<HTMLElement>(".pin-sidebar-hint")!;

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

const transportControls = { playBtn, pauseBtn, stopBtn };

let hostReady = false;
let playerState: PlayerState = "idle";
let sessionActive = false;
let hasDisplayedText = false;
let playbackActive = false;

const readAlongView = mountReadAlongView(readAlongContainer, {
  onChunkClick: createChunkClickHandler(() => ({ sessionActive, hasDisplayedText })),
});

function showOnboarding(show: boolean): void {
  onboardingEl.classList.toggle("hidden", !show);
  mainContent.classList.toggle("hidden", show);
  playBtn.disabled = !hostReady;
}

function applyHostSetupChange(ready: boolean): void {
  hostReady = ready;
  showOnboarding(!ready);
  updateReadPageButton();
  if (ready) {
    setStatus(statusEl, "Ready");
  }
}

async function runHostCheck(): Promise<void> {
  hostReady = await checkHostConnection(statusEl, {
    surface: "popup",
    onSetupStateChange: applyHostSetupChange,
  });
}

function updateReadAlongUi(message: StateUpdateMessage): void {
  const hasText = hasReadAlongText(message.readAlong);

  textInput.classList.toggle("hidden", hasText);
  readAlongContainer.classList.toggle("hidden", !hasText);
  updateReadPageButton();

  if (hasText) {
    readAlongView.update({
      chunks: message.readAlong.chunks,
      activeChunkIndex: message.readAlong.activeChunkIndex,
    });
    return;
  }

  readAlongView.clear();
}

function updateReadPageButton(): void {
  const showReadPage =
    hostReady && !hasDisplayedText && !sessionActive && textInput.value.trim().length === 0;
  readPageBtn.classList.toggle("hidden", !showReadPage);
}

async function readPageAloud(): Promise<void> {
  if (!hostReady) {
    showOnboarding(true);
    setStatus(statusEl, "Complete one-time setup before playing audio.", "error");
    return;
  }

  await requestReadPage(statusEl);
}

readPageBtn.addEventListener("click", () => {
  void readPageAloud();
});

textInput.addEventListener("input", () => {
  updateReadPageButton();
});

async function startSynthesis(): Promise<void> {
  if (!hostReady) {
    showOnboarding(true);
    setStatus(statusEl, "Complete one-time setup before playing audio.", "error");
    return;
  }

  const text = textInput.value.trim();
  const options = {
    voice: voiceSelect.value,
    speed: Number(speedRange.value),
    lang: langSelect.value,
    format: DEFAULT_FORMAT,
  };

  await browser.runtime.sendMessage({
    type: "SAVE_SETTINGS",
    settings: {
      voice: options.voice,
      speed: options.speed,
      lang: options.lang,
    },
  });

  await browser.runtime.sendMessage({ type: "PREPARE_PLAYBACK" });

  if (!text) {
    setStatus(statusEl, "Enter text first.", "error");
    return;
  }

  setStatus(statusEl, "Sending text to kokoro-tts...");
  const response = await browser.runtime.sendMessage({
    type: "START_SYNTHESIS",
    content: text,
    options,
  });

  if (!response?.ok) {
    setStatus(statusEl, response?.error ?? "Failed to start synthesis", "error");
  }
}

wireTtsControls({
  langSelect,
  voiceSelect,
  speedRange,
  speedValue,
  persist: "immediate",
});

wireTransportControls({
  controls: transportControls,
  getState: () => ({ playerState, sessionActive, hasDisplayedText, playbackActive }),
  onPlay: () => {
    void startSynthesis();
  },
});

openOptions.addEventListener("click", (event) => {
  event.preventDefault();
  void browser.runtime.openOptionsPage();
});

async function pinToSidebar(): Promise<void> {
  try {
    await openReadAlongSidebar();
    window.close();
  } catch {
    setStatus(statusEl, "Could not open the read-along panel.", "error");
  }
}

async function updatePinSidebarHint(): Promise<void> {
  const shortcut = await getOpenSidebarShortcut();
  if (!pinSidebarHint) {
    return;
  }
  pinSidebarHint.textContent = `Open Sidebar: ${shortcut}`;
}

pinSidebarBtn.addEventListener("click", () => {
  void pinToSidebar();
});

if (!isSidebarAvailable()) {
  pinSidebarBtn.hidden = true;
  pinSidebarHint?.classList.add("hidden");
} else {
  void updatePinSidebarHint();
}

openSettingsBtn.addEventListener("click", () => {
  void browser.runtime.openOptionsPage();
});

populateOnboardingContent(onboardingElements, "popup");
wireOnboardingCopyButtons(onboardingElements, statusEl);
showOnboarding(true);

retrySetupBtn.addEventListener("click", () => {
  setStatus(statusEl, "Checking connection...");
  void runHostCheck();
});

function applyTtsSettings(message: StateUpdateMessage): void {
  populateLanguages(langSelect, message.settings.lang);
  populateVoices(voiceSelect, message.settings.lang, message.settings.voice);
  speedRange.value = String(message.settings.speed);
  speedValue.textContent = message.settings.speed.toFixed(1);
}

function applyExtensionState(message: StateUpdateMessage): void {
  updateReadAlongUi(message);
  const transportState = applyReadAlongTransportState(message, {
    transportControls,
    statusEl,
    onSessionFlagsChange: ({ sessionActive: active, hasDisplayedText: hasText }) => {
      sessionActive = active;
      hasDisplayedText = hasText;
      updateReadPageButton();
    },
  });
  playerState = transportState.playerState;
  playbackActive = transportState.playbackActive;
}

subscribeToExtensionState((message) => {
  applyTtsSettings(message);
  applyExtensionState(message);
  updateReadPageButton();
});

listenForHostSetupChanges(applyHostSetupChange);

void (async () => {
  try {
    await runHostCheck();
  } catch {
    showOnboarding(true);
    setStatus(
      statusEl,
      "Could not reach the extension background. Try reopening the popup.",
      "error",
    );
  }
})();
