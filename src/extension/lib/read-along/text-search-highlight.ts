export const SEARCH_MATCH_CLASS = "kokoro-search-match";
export const SEARCH_MATCH_CURRENT_CLASS = "kokoro-search-match--current";

export interface ChunkMatchLocation {
  chunkIndex: number;
  start: number;
}

export function findSubstringMatches(text: string, query: string): number[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = trimmed.toLowerCase();
  const matches: number[] = [];
  let start = 0;

  while (start <= lowerText.length - lowerQuery.length) {
    const index = lowerText.indexOf(lowerQuery, start);
    if (index === -1) {
      break;
    }

    matches.push(index);
    start = index + lowerQuery.length;
  }

  return matches;
}

export function findAllMatchesInChunks(chunks: string[], query: string): ChunkMatchLocation[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const results: ChunkMatchLocation[] = [];

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    for (const start of findSubstringMatches(chunks[chunkIndex], trimmed)) {
      results.push({ chunkIndex, start });
    }
  }

  return results;
}

export function buildHighlightedFragment(
  text: string,
  query: string,
  activeMatchStart?: number | null,
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const trimmed = query.trim();

  if (!trimmed) {
    fragment.appendChild(document.createTextNode(text));
    return fragment;
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = trimmed.toLowerCase();
  const queryLength = trimmed.length;
  let start = 0;

  while (start < text.length) {
    const index = lowerText.indexOf(lowerQuery, start);
    if (index === -1) {
      fragment.appendChild(document.createTextNode(text.slice(start)));
      break;
    }

    if (index > start) {
      fragment.appendChild(document.createTextNode(text.slice(start, index)));
    }

    const mark = document.createElement("mark");
    mark.className = SEARCH_MATCH_CLASS;
    if (activeMatchStart !== null && activeMatchStart !== undefined && index === activeMatchStart) {
      mark.classList.add(SEARCH_MATCH_CURRENT_CLASS);
    }
    mark.textContent = text.slice(index, index + queryLength);
    fragment.appendChild(mark);
    start = index + queryLength;
  }

  return fragment;
}
