import {
  CHUNK_FALLBACK_CUT_WORDS,
  CHUNK_TARGET_MAX_WORDS,
  CHUNK_TARGET_MIN_WORDS,
} from "../defaults";

interface WordSpan {
  start: number;
  end: number;
  text: string;
}

function tokenizeWords(text: string): WordSpan[] {
  const words: WordSpan[] = [];
  const pattern = /\S+/g;
  let match = pattern.exec(text);

  while (match !== null) {
    words.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
    });
    match = pattern.exec(text);
  }

  return words;
}

function endsWithSentenceTerminator(word: string): boolean {
  return /[.!?]$/.test(word);
}

function findSentenceBreakWordIndex(words: WordSpan[], wordStart: number): number | null {
  const minIdx = wordStart + CHUNK_TARGET_MIN_WORDS - 1;
  const maxIdx = Math.min(wordStart + CHUNK_TARGET_MAX_WORDS - 1, words.length - 1);

  for (let index = maxIdx; index >= minIdx; index -= 1) {
    if (endsWithSentenceTerminator(words[index].text)) {
      return index;
    }
  }

  return null;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}

export function splitIntoTextChunks(text: string): string[] {
  const src = text.trim();
  if (!src) {
    return [];
  }

  const words = tokenizeWords(src);
  if (words.length <= CHUNK_FALLBACK_CUT_WORDS) {
    return [src];
  }

  const chunks: string[] = [];
  let wordStart = 0;

  while (wordStart < words.length) {
    const remaining = words.length - wordStart;
    if (remaining <= CHUNK_FALLBACK_CUT_WORDS) {
      chunks.push(src.slice(words[wordStart].start));
      break;
    }

    const sentenceBreak = findSentenceBreakWordIndex(words, wordStart);
    const endWordIdx =
      sentenceBreak !== null ? sentenceBreak : wordStart + CHUNK_FALLBACK_CUT_WORDS - 1;
    const nextWordStart = endWordIdx + 1;
    const chunkEnd = nextWordStart < words.length ? words[nextWordStart].start : src.length;

    chunks.push(src.slice(words[wordStart].start, chunkEnd));
    wordStart = nextWordStart;
  }

  return chunks;
}

export function joinTextChunks(chunks: string[]): string {
  return chunks.join("");
}

export function chunksEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((chunk, index) => chunk === b[index]);
}
