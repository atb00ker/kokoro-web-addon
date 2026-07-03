import type { PlayerState } from "../../lib/audio/audio-player";
import type { SessionState } from "../../lib/extension-state";
import {
  hasReadAlongText,
  isActiveReadAlongSession,
  isPlaybackActive,
  type StateUpdateMessage,
} from "../../lib/extension-state";
import { LANGUAGES, VOICES, getVoicesForLanguage } from "../../lib/voices";

export type StatusTone = "default" | "error" | "success" | "warning";

export function setStatus(
  element: HTMLElement,
  message: string,
  tone: StatusTone = "default",
): void {
  element.textContent = message;
  element.classList.remove("error", "success", "warning");
  if (tone !== "default") {
    element.classList.add(tone);
  }
}

export function populateLanguages(select: HTMLSelectElement, selectedLang: string): void {
  select.replaceChildren(
    ...LANGUAGES.map((language) => {
      const option = document.createElement("option");
      option.value = language.id;
      option.textContent = language.label;
      option.selected = language.id === selectedLang;
      return option;
    }),
  );
}

export function populateVoices(
  select: HTMLSelectElement,
  lang: string,
  selectedVoice: string,
): void {
  const voices = getVoicesForLanguage(lang);
  const options = voices.length > 0 ? voices : VOICES;
  const validVoice = options.some((voice) => voice.id === selectedVoice)
    ? selectedVoice
    : (options[0]?.id ?? selectedVoice);
  select.replaceChildren(
    ...options.map((voice) => {
      const option = document.createElement("option");
      option.value = voice.id;
      option.textContent = voice.label;
      option.selected = voice.id === validVoice;
      return option;
    }),
  );
}

function updateStopClearButton(
  stopBtn: HTMLButtonElement,
  session: SessionState,
  playerState: PlayerState,
  hasText: boolean,
): void {
  const playbackActive = isPlaybackActive(session, playerState);

  if (playbackActive) {
    stopBtn.textContent = "Stop";
    stopBtn.setAttribute("aria-label", "Stop playback");
    stopBtn.disabled = false;
    return;
  }

  if (hasText) {
    stopBtn.textContent = "Clear";
    stopBtn.setAttribute("aria-label", "Clear text");
    stopBtn.disabled = false;
    return;
  }

  stopBtn.textContent = "Stop";
  stopBtn.setAttribute("aria-label", "Stop playback");
  stopBtn.disabled = true;
}

export interface TransportControls {
  playBtn: HTMLButtonElement;
  pauseBtn: HTMLButtonElement;
  stopBtn: HTMLButtonElement;
}

function updateTransportButtons(
  controls: TransportControls,
  state: PlayerState,
  session: SessionState,
  hasText: boolean,
  options?: { disablePlayWhilePlaying?: boolean },
): void {
  controls.playBtn.textContent = state === "paused" ? "Resume" : "Play";
  controls.pauseBtn.disabled = state !== "playing" && state !== "buffering";
  if (options?.disablePlayWhilePlaying) {
    controls.playBtn.disabled = state === "playing" || state === "buffering";
  }
  updateStopClearButton(controls.stopBtn, session, state, hasText);
}

export function createChunkClickHandler(
  getState: () => { sessionActive: boolean; hasDisplayedText: boolean },
) {
  return (index: number): void => {
    const { sessionActive, hasDisplayedText } = getState();
    if (sessionActive) {
      void browser.runtime.sendMessage({ type: "JUMP_TO_CHUNK", index });
      return;
    }

    if (hasDisplayedText) {
      void browser.runtime.sendMessage({ type: "REPLAY_READ_ALONG", fromChunkIndex: index });
    }
  };
}

export interface ReadAlongTransportContext {
  sessionActive: boolean;
  hasDisplayedText: boolean;
  playerState: PlayerState;
  playbackActive: boolean;
}

export interface ApplyReadAlongTransportOptions {
  transportControls: TransportControls;
  statusEl: HTMLElement;
  disablePlayWhilePlaying?: boolean;
  onSessionFlagsChange?: (flags: { sessionActive: boolean; hasDisplayedText: boolean }) => void;
}

export function applyReadAlongTransportState(
  message: StateUpdateMessage,
  options: ApplyReadAlongTransportOptions,
): ReadAlongTransportContext {
  const sessionActive = isActiveReadAlongSession(message.session, message.readAlong);
  const hasDisplayedText = hasReadAlongText(message.readAlong);

  options.onSessionFlagsChange?.({ sessionActive, hasDisplayedText });

  setStatus(
    options.statusEl,
    message.session.error ?? message.session.statusMessage,
    message.session.error ? "error" : "default",
  );

  updateTransportButtons(
    options.transportControls,
    message.playerState,
    message.session,
    hasDisplayedText,
    options.disablePlayWhilePlaying ? { disablePlayWhilePlaying: true } : undefined,
  );

  return {
    sessionActive,
    hasDisplayedText,
    playerState: message.playerState,
    playbackActive: isPlaybackActive(message.session, message.playerState),
  };
}

export interface WireTransportControlsOptions {
  controls: TransportControls;
  getState: () => ReadAlongTransportContext;
  onPlay: () => void;
}

export function wireTransportControls(options: WireTransportControlsOptions): void {
  options.controls.playBtn.addEventListener("click", () => {
    const { playerState, sessionActive, hasDisplayedText } = options.getState();

    if (playerState === "paused") {
      void browser.runtime.sendMessage({ type: "RESUME" });
      return;
    }

    if (hasDisplayedText && !sessionActive) {
      void browser.runtime.sendMessage({ type: "REPLAY_READ_ALONG" });
      return;
    }

    options.onPlay();
  });

  options.controls.pauseBtn.addEventListener("click", () => {
    void browser.runtime.sendMessage({ type: "PAUSE" });
  });

  options.controls.stopBtn.addEventListener("click", () => {
    const { hasDisplayedText, playbackActive } = options.getState();

    if (hasDisplayedText && !playbackActive) {
      void browser.runtime.sendMessage({ type: "CLEAR_READ_ALONG" });
      return;
    }

    void browser.runtime.sendMessage({ type: "STOP" });
  });
}

export async function requestReadPage(
  statusEl?: HTMLElement,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (statusEl) {
    setStatus(statusEl, "Extracting page text...");
  }

  const response = await browser.runtime.sendMessage({ type: "READ_PAGE" });

  if (!response?.ok) {
    const error = response?.error ?? "Failed to read page";
    if (statusEl) {
      setStatus(statusEl, error, "error");
    }
    return { ok: false, error };
  }

  return { ok: true };
}

export interface WireTtsControlsOptions {
  langSelect: HTMLSelectElement;
  voiceSelect: HTMLSelectElement;
  speedRange: HTMLInputElement;
  speedValue: HTMLElement;
  persist?: "immediate" | "manual";
}

export function wireTtsControls(options: WireTtsControlsOptions): void {
  const persistSettings = async (partial: {
    lang?: string;
    voice?: string;
    speed?: number;
  }): Promise<void> => {
    if (options.persist !== "immediate") {
      return;
    }

    await browser.runtime.sendMessage({
      type: "SAVE_SETTINGS",
      settings: partial,
    });
  };

  options.langSelect.addEventListener("change", () => {
    populateVoices(options.voiceSelect, options.langSelect.value, options.voiceSelect.value);
    void persistSettings({
      lang: options.langSelect.value,
      voice: options.voiceSelect.value,
    });
  });

  options.voiceSelect.addEventListener("change", () => {
    void persistSettings({ voice: options.voiceSelect.value });
  });

  options.speedRange.addEventListener("input", () => {
    options.speedValue.textContent = Number(options.speedRange.value).toFixed(1);
  });

  options.speedRange.addEventListener("change", () => {
    void persistSettings({ speed: Number(options.speedRange.value) });
  });
}
