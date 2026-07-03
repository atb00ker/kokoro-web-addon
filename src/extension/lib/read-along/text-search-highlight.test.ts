import { describe, expect, test } from "bun:test";
import { findAllMatchesInChunks, findSubstringMatches } from "./text-search-highlight";

describe("findSubstringMatches", () => {
  test("returns empty array for blank query", () => {
    expect(findSubstringMatches("hello world", "")).toEqual([]);
    expect(findSubstringMatches("hello world", "   ")).toEqual([]);
  });

  test("returns empty array when no matches", () => {
    expect(findSubstringMatches("hello world", "xyz")).toEqual([]);
  });

  test("finds multiple non-overlapping matches", () => {
    expect(findSubstringMatches("foo bar foo baz foo", "foo")).toEqual([0, 8, 16]);
  });

  test("matches case-insensitively", () => {
    expect(findSubstringMatches("Hello HELLO hello", "hello")).toEqual([0, 6, 12]);
  });

  test("finds partial-word matches", () => {
    expect(findSubstringMatches("JavaScript is a scripting language", "ript")).toEqual([6, 18]);
  });
});

describe("findAllMatchesInChunks", () => {
  test("returns empty array for blank query", () => {
    expect(findAllMatchesInChunks(["one two", "three four"], "")).toEqual([]);
  });

  test("finds matches across chunks", () => {
    expect(findAllMatchesInChunks(["foo bar", "baz foo"], "foo")).toEqual([
      { chunkIndex: 0, start: 0 },
      { chunkIndex: 1, start: 4 },
    ]);
  });

  test("finds multiple matches within a single chunk", () => {
    expect(findAllMatchesInChunks(["aa aa aa"], "aa")).toEqual([
      { chunkIndex: 0, start: 0 },
      { chunkIndex: 0, start: 3 },
      { chunkIndex: 0, start: 6 },
    ]);
  });
});
