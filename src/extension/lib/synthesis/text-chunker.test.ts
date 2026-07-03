import { describe, expect, test } from "bun:test";
import { countWords, joinTextChunks, splitIntoTextChunks } from "./text-chunker";

function makeWords(count: number, suffix = ""): string {
  return Array.from({ length: count }, (_, index) => `word${index}${suffix}`).join(" ");
}

describe("splitIntoTextChunks", () => {
  test("returns empty array for blank input", () => {
    expect(splitIntoTextChunks("")).toEqual([]);
    expect(splitIntoTextChunks("   ")).toEqual([]);
  });

  test("returns a single chunk for text with 60 words or fewer", () => {
    const text = makeWords(60);
    expect(countWords(text)).toBe(60);
    expect(splitIntoTextChunks(text)).toEqual([text]);
  });

  test("breaks after a sentence terminator between words 40 and 60", () => {
    const prefix = makeWords(44);
    const suffix = makeWords(20);
    const text = `${prefix} end. ${suffix}`;

    const chunks = splitIntoTextChunks(text);

    expect(countWords(chunks[0])).toBe(45);
    expect(chunks[0].trimEnd().endsWith("end.")).toBe(true);
    expect(chunks.join("")).toBe(text);
  });

  test("breaks after a sentence terminator between words 60 and 80", () => {
    const prefix = makeWords(65);
    const suffix = makeWords(20);
    const text = `${prefix} stop. ${suffix}`;

    const chunks = splitIntoTextChunks(text);

    expect(countWords(chunks[0])).toBe(66);
    expect(chunks[0].trimEnd().endsWith("stop.")).toBe(true);
    expect(chunks.join("")).toBe(text);
  });

  test("uses the last sentence terminator within the 40-80 word window", () => {
    const prefix = makeWords(39);
    const middle = makeWords(5);
    const suffix = makeWords(20);
    const text = `${prefix} one. ${middle} two! ${suffix}`;

    const chunks = splitIntoTextChunks(text);

    expect(countWords(chunks[0])).toBe(46);
    expect(chunks[0].trimEnd().endsWith("two!")).toBe(true);
    expect(chunks.join("")).toBe(text);
  });

  test("falls back to a 60-word hard limit when no sentence terminator is in range", () => {
    const prefix = makeWords(60);
    const suffix = makeWords(20);
    const text = `${prefix} ${suffix}`;

    const chunks = splitIntoTextChunks(text);

    expect(countWords(chunks[0])).toBe(60);
    expect(chunks.join("")).toBe(text);
  });

  test("treats exclamation and question marks as sentence terminators", () => {
    const prefix = makeWords(44);
    const suffix = makeWords(20);
    const text = `${prefix} done! ${suffix}`;

    const chunks = splitIntoTextChunks(text);

    expect(chunks[0].trimEnd().endsWith("done!")).toBe(true);
    expect(chunks.join("")).toBe(text);
  });

  test("trims leading and trailing whitespace before chunking", () => {
    const inner = `${makeWords(44)} end. ${makeWords(20)}`;
    const text = `  ${inner}  `;

    const chunks = splitIntoTextChunks(text);

    expect(chunks.join("")).toBe(inner);
  });

  test("chunks concatenate back to the trimmed input", () => {
    const text = `${makeWords(12)} First sentence ends here. ${makeWords(8)} Second ends! ${makeWords(40)}`;

    const chunks = splitIntoTextChunks(text);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(text.trim());
  });
});

describe("joinTextChunks", () => {
  test("round-trips with splitIntoTextChunks for multi-chunk text", () => {
    const text = `${makeWords(12)} First sentence ends here. ${makeWords(8)} Second ends! ${makeWords(40)}`;
    const chunks = splitIntoTextChunks(text);

    expect(chunks.length).toBeGreaterThan(1);
    expect(joinTextChunks(chunks)).toBe(text.trim());
  });
});
