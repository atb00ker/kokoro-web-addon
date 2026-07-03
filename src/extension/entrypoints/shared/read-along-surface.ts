import type { PlayerState } from "../../lib/audio/audio-player";
import { subscribeToExtensionState } from "../../lib/extension-client";
import { hasReadAlongText, type StateUpdateMessage } from "../../lib/extension-state";
import {
  mountReadAlongView,
  type ReadAlongController,
  type SearchMatchCount,
} from "../../lib/read-along/read-along-view";
import {
  applyReadAlongTransportState,
  createChunkClickHandler,
  type ReadAlongTransportContext,
  type TransportControls,
  wireTransportControls,
} from "./ui";

export interface ReadAlongSearchElements {
  bar: HTMLElement;
  input: HTMLInputElement;
  count: HTMLElement;
  prevBtn: HTMLButtonElement;
  nextBtn: HTMLButtonElement;
}

export interface ReadAlongSurfaceOptions {
  container: HTMLElement;
  transportControls: TransportControls;
  statusEl: HTMLElement;
  disablePlayWhilePlaying?: boolean;
  onPlay: () => void;
  search?: ReadAlongSearchElements;
  emptyStateEl?: HTMLElement;
  onStateApplied?: (context: ReadAlongTransportContext) => void;
}

export interface ReadAlongSurface {
  readAlongView: ReadAlongController;
  applyState: (message: StateUpdateMessage) => void;
  unsubscribe: () => void;
}

function formatSearchCountLabel(query: string, matchCount: SearchMatchCount | null): string {
  if (!query.trim()) {
    return "";
  }

  if (!matchCount) {
    return "No matches";
  }

  return `${matchCount.position} of ${matchCount.total}`;
}

function updateSearchNavButtons(
  elements: ReadAlongSearchElements,
  matchCount: SearchMatchCount | null,
): void {
  const hasMatches = matchCount !== null;
  elements.prevBtn.disabled = !hasMatches;
  elements.nextBtn.disabled = !hasMatches;
}

export function createReadAlongSurface(options: ReadAlongSurfaceOptions): ReadAlongSurface {
  let sessionActive = false;
  let hasDisplayedText = false;
  let playerState: PlayerState = "idle";
  let playbackActive = false;
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  const readAlongView = mountReadAlongView(options.container, {
    onChunkClick: createChunkClickHandler(() => ({ sessionActive, hasDisplayedText })),
  });

  function applySearchUi(query: string): void {
    if (!options.search) {
      return;
    }

    const matchCount = readAlongView.getSearchMatchCount();
    options.search.count.textContent = formatSearchCountLabel(query, matchCount);
    updateSearchNavButtons(options.search, matchCount);
  }

  function applyState(message: StateUpdateMessage): void {
    const hasText = hasReadAlongText(message.readAlong);

    options.emptyStateEl?.classList.toggle("hidden", hasText);
    options.search?.bar.classList.toggle("hidden", !hasText);
    options.container.classList.toggle("hidden", !hasText);

    if (hasText) {
      readAlongView.update({
        chunks: message.readAlong.chunks,
        activeChunkIndex: message.readAlong.activeChunkIndex,
      });

      if (options.search) {
        applySearchUi(options.search.input.value);
      }
    } else {
      if (options.search) {
        options.search.input.value = "";
        options.search.count.textContent = "";
        updateSearchNavButtons(options.search, null);
      }
      readAlongView.clearSearch();
      readAlongView.clear();
    }

    const transportState = applyReadAlongTransportState(message, {
      transportControls: options.transportControls,
      statusEl: options.statusEl,
      disablePlayWhilePlaying: options.disablePlayWhilePlaying,
      onSessionFlagsChange: ({ sessionActive: active, hasDisplayedText: hasDisplayed }) => {
        sessionActive = active;
        hasDisplayedText = hasDisplayed;
      },
    });
    playerState = transportState.playerState;
    playbackActive = transportState.playbackActive;
    options.onStateApplied?.(transportState);
  }

  wireTransportControls({
    controls: options.transportControls,
    getState: () => ({ playerState, sessionActive, hasDisplayedText, playbackActive }),
    onPlay: options.onPlay,
  });

  if (options.search) {
    const search = options.search;

    search.input.addEventListener("input", () => {
      if (searchDebounceTimer !== null) {
        clearTimeout(searchDebounceTimer);
      }

      const query = search.input.value;
      searchDebounceTimer = setTimeout(() => {
        searchDebounceTimer = null;
        readAlongView.setSearchQuery(query, true);
        applySearchUi(query);
      }, 150);
    });

    search.input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || readAlongView.getSearchMatchCount() === null) {
        return;
      }

      event.preventDefault();
      if (event.shiftKey) {
        readAlongView.goToPreviousSearchMatch();
      } else {
        readAlongView.goToNextSearchMatch();
      }
      applySearchUi(search.input.value);
    });

    search.prevBtn.addEventListener("click", () => {
      readAlongView.goToPreviousSearchMatch();
      applySearchUi(search.input.value);
    });

    search.nextBtn.addEventListener("click", () => {
      readAlongView.goToNextSearchMatch();
      applySearchUi(search.input.value);
    });
  }

  const unsubscribe = subscribeToExtensionState(applyState);

  return {
    readAlongView,
    applyState,
    unsubscribe,
  };
}
