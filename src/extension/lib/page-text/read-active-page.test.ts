import { describe, expect, test } from "bun:test";
import { isRestrictedPageUrl } from "./read-active-page";

describe("isRestrictedPageUrl", () => {
  test("rejects missing and internal browser URLs", () => {
    expect(isRestrictedPageUrl(undefined)).toBe(true);
    expect(isRestrictedPageUrl("about:blank")).toBe(true);
    expect(isRestrictedPageUrl("chrome://extensions")).toBe(true);
    expect(isRestrictedPageUrl("chrome-search://local")).toBe(true);
    expect(isRestrictedPageUrl("moz-extension://abc/popup.html")).toBe(true);
    expect(isRestrictedPageUrl("javascript:alert(1)")).toBe(true);
    expect(isRestrictedPageUrl("blob:https://example.com/uuid")).toBe(true);
    expect(isRestrictedPageUrl("devtools://devtools/bundled/inspector.html")).toBe(true);
  });

  test("allows regular web pages", () => {
    expect(isRestrictedPageUrl("https://example.com/article")).toBe(false);
    expect(isRestrictedPageUrl("http://localhost:3000")).toBe(false);
  });
});
