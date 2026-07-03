import {
  checkHostConnection,
  populateOnboardingContent,
  wireOnboardingCopyButtons,
  type OnboardingElements,
} from "../shared/onboarding-ui";
import { listenForHostSetupChanges } from "../../lib/extension-client";
import { createReadAlongSurface } from "../shared/read-along-surface";
import { requestReadPage, setStatus } from "../shared/ui";

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
const emptyStateEl = document.querySelector<HTMLElement>("#read-along-empty")!;
const readPageBtn = document.querySelector<HTMLButtonElement>("#read-page-btn")!;
const searchBarEl = document.querySelector<HTMLElement>("#read-along-search")!;
const searchInputEl = document.querySelector<HTMLInputElement>("#read-along-search-input")!;
const searchCountEl = document.querySelector<HTMLElement>("#read-along-search-count")!;
const searchPrevBtn = document.querySelector<HTMLButtonElement>("#read-along-search-prev")!;
const searchNextBtn = document.querySelector<HTMLButtonElement>("#read-along-search-next")!;
const readAlongContainer = document.querySelector<HTMLElement>("#read-along-view")!;
const playBtn = document.querySelector<HTMLButtonElement>("#play-btn")!;
const pauseBtn = document.querySelector<HTMLButtonElement>("#pause-btn")!;
const stopBtn = document.querySelector<HTMLButtonElement>("#stop-btn")!;
const statusEl = document.querySelector<HTMLParagraphElement>("#status")!;

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

function showOnboarding(show: boolean): void {
  onboardingEl.classList.toggle("hidden", !show);
  mainContent.classList.toggle("hidden", show);
  playBtn.disabled = !hostReady;
}

function applyHostSetupChange(ready: boolean): void {
  hostReady = ready;
  showOnboarding(!ready);
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

readAlongContainer.classList.add("read-along-view--sidebar");

createReadAlongSurface({
  container: readAlongContainer,
  transportControls,
  statusEl,
  disablePlayWhilePlaying: true,
  emptyStateEl,
  search: {
    bar: searchBarEl,
    input: searchInputEl,
    count: searchCountEl,
    prevBtn: searchPrevBtn,
    nextBtn: searchNextBtn,
  },
  onPlay: () => {
    if (!hostReady) {
      showOnboarding(true);
      setStatus(statusEl, "Complete one-time setup before playing audio.", "error");
      return;
    }

    setStatus(statusEl, "Select text and choose Read with Kokoro, or use Read page aloud.");
  },
});

readPageBtn.addEventListener("click", () => {
  if (!hostReady) {
    showOnboarding(true);
    setStatus(statusEl, "Complete one-time setup before playing audio.", "error");
    return;
  }

  void requestReadPage(statusEl);
});

populateOnboardingContent(onboardingElements, "popup");
wireOnboardingCopyButtons(onboardingElements, statusEl);
showOnboarding(true);

retrySetupBtn.addEventListener("click", () => {
  setStatus(statusEl, "Checking connection...");
  void runHostCheck();
});

openSettingsBtn.addEventListener("click", () => {
  void browser.runtime.openOptionsPage();
});

listenForHostSetupChanges(applyHostSetupChange);

void (async () => {
  try {
    await runHostCheck();
  } catch {
    showOnboarding(true);
    setStatus(
      statusEl,
      "Could not reach the extension background. Try reopening the sidebar.",
      "error",
    );
  }
})();
