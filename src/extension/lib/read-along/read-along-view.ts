import {
  buildHighlightedFragment,
  findAllMatchesInChunks,
  SEARCH_MATCH_CURRENT_CLASS,
  type ChunkMatchLocation,
} from "./text-search-highlight";
import { chunksEqual } from "../synthesis/text-chunker";

const CHUNK_CLASS = "kokoro-read-chunk";
const ACTIVE_CLASS = "kokoro-read-chunk--active";

export interface ReadAlongViewState {
  chunks: string[];
  activeChunkIndex: number | null;
}

export interface SearchMatchCount {
  position: number;
  total: number;
}

export interface ReadAlongController {
  update(state: ReadAlongViewState): void;
  setSearchQuery(query: string, scrollToMatch?: boolean): SearchMatchCount | null;
  goToNextSearchMatch(): void;
  goToPreviousSearchMatch(): void;
  clearSearch(): void;
  getSearchMatchCount(): SearchMatchCount | null;
  scrollSearchMatchIntoView(): void;
  clear(): void;
}

export interface ReadAlongViewOptions {
  onChunkClick?: (index: number) => void;
}

export function mountReadAlongView(
  container: HTMLElement,
  options: ReadAlongViewOptions = {},
): ReadAlongController {
  container.classList.add("read-along-view");

  let lastActiveIndex: number | null = null;
  let currentChunks: string[] = [];
  let currentSearchQuery = "";
  let activeSearchMatchIndex: number | null = null;
  let searchMatches: ChunkMatchLocation[] = [];
  let chunkElements: HTMLElement[] = [];

  function recomputeSearchMatches(): void {
    searchMatches = currentSearchQuery.trim()
      ? findAllMatchesInChunks(currentChunks, currentSearchQuery)
      : [];

    if (searchMatches.length === 0) {
      activeSearchMatchIndex = null;
      return;
    }

    if (activeSearchMatchIndex === null || activeSearchMatchIndex >= searchMatches.length) {
      activeSearchMatchIndex = 0;
    }
  }

  function getActiveMatchStartForChunk(chunkIndex: number): number | null {
    if (activeSearchMatchIndex === null || !currentSearchQuery.trim()) {
      return null;
    }

    const active = searchMatches[activeSearchMatchIndex];
    if (!active || active.chunkIndex !== chunkIndex) {
      return null;
    }

    return active.start;
  }

  function getSearchMatchCount(): SearchMatchCount | null {
    if (!currentSearchQuery.trim() || searchMatches.length === 0) {
      return null;
    }

    return {
      position: (activeSearchMatchIndex ?? 0) + 1,
      total: searchMatches.length,
    };
  }

  function applySearchHighlights(): void {
    for (let index = 0; index < chunkElements.length; index += 1) {
      const element = chunkElements[index];
      const chunkText = currentChunks[index] ?? "";
      const activeMatchStart = getActiveMatchStartForChunk(index);
      element.replaceChildren(
        buildHighlightedFragment(chunkText, currentSearchQuery, activeMatchStart),
      );
    }
  }

  function renderChunks(chunks: string[]): void {
    container.replaceChildren();
    chunkElements = [];

    for (let index = 0; index < chunks.length; index += 1) {
      const span = document.createElement("span");
      span.className = CHUNK_CLASS;
      span.dataset.chunkIndex = String(index);
      const activeMatchStart = getActiveMatchStartForChunk(index);
      span.replaceChildren(
        buildHighlightedFragment(chunks[index], currentSearchQuery, activeMatchStart),
      );
      if (options.onChunkClick) {
        span.addEventListener("click", () => {
          options.onChunkClick?.(index);
        });
      }
      container.appendChild(span);
      chunkElements.push(span);

      if (index < chunks.length - 1) {
        container.appendChild(document.createTextNode(" "));
      }
    }
  }

  function setActiveChunk(activeChunkIndex: number | null): void {
    for (const element of chunkElements) {
      const index = Number(element.dataset.chunkIndex);
      element.classList.toggle(
        ACTIVE_CLASS,
        activeChunkIndex !== null && index === activeChunkIndex,
      );
    }
  }

  function scrollActiveChunk(activeChunkIndex: number | null): void {
    if (activeChunkIndex === null) {
      return;
    }

    chunkElements[activeChunkIndex]?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }

  return {
    update(state: ReadAlongViewState): void {
      const chunksChanged = !chunksEqual(state.chunks, currentChunks);

      if (chunksChanged) {
        currentChunks = [...state.chunks];
        recomputeSearchMatches();
        renderChunks(state.chunks);
        lastActiveIndex = null;
      }

      if (state.activeChunkIndex !== lastActiveIndex) {
        setActiveChunk(state.activeChunkIndex);
        lastActiveIndex = state.activeChunkIndex;
        scrollActiveChunk(state.activeChunkIndex);
      }
    },

    setSearchQuery(query: string, scrollToMatch = false): SearchMatchCount | null {
      currentSearchQuery = query;
      recomputeSearchMatches();

      if (chunkElements.length > 0) {
        applySearchHighlights();
      }

      if (scrollToMatch) {
        this.scrollSearchMatchIntoView();
      }

      return getSearchMatchCount();
    },

    goToNextSearchMatch(): void {
      if (searchMatches.length === 0 || activeSearchMatchIndex === null) {
        return;
      }

      activeSearchMatchIndex = (activeSearchMatchIndex + 1) % searchMatches.length;
      applySearchHighlights();
      this.scrollSearchMatchIntoView();
    },

    goToPreviousSearchMatch(): void {
      if (searchMatches.length === 0 || activeSearchMatchIndex === null) {
        return;
      }

      const total = searchMatches.length;
      activeSearchMatchIndex = (activeSearchMatchIndex - 1 + total) % total;
      applySearchHighlights();
      this.scrollSearchMatchIntoView();
    },

    clearSearch(): void {
      currentSearchQuery = "";
      activeSearchMatchIndex = null;
      searchMatches = [];
      if (chunkElements.length > 0) {
        applySearchHighlights();
      }
    },

    getSearchMatchCount,

    scrollSearchMatchIntoView(): void {
      const current = container.querySelector(`.${SEARCH_MATCH_CURRENT_CLASS}`);
      current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    },

    clear(): void {
      container.replaceChildren();
      chunkElements = [];
      currentChunks = [];
      currentSearchQuery = "";
      activeSearchMatchIndex = null;
      searchMatches = [];
      lastActiveIndex = null;
    },
  };
}
