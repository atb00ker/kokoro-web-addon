import { normalizeWhitespace } from "./extract-page-text";

const PAGE_TEXT_EXTRACTOR_SCRIPT = "/page-text-extractor.js";

const RESTRICTED_URL_PREFIXES = [
  "about:",
  "chrome:",
  "chrome-extension:",
  "chrome-search:",
  "moz-extension:",
  "edge:",
  "view-source:",
  "data:",
  "file:",
  "javascript:",
  "blob:",
  "devtools:",
];

export function isRestrictedPageUrl(url: string | undefined): boolean {
  if (!url) {
    return true;
  }

  return RESTRICTED_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
}

async function getActiveTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

type ScriptInjectionResult = { result?: unknown };

async function injectPageTextExtractor(tabId: number): Promise<string | null> {
  if (browser.scripting?.executeScript) {
    const results = (await browser.scripting.executeScript({
      target: { tabId },
      files: [PAGE_TEXT_EXTRACTOR_SCRIPT],
    })) as ScriptInjectionResult[];

    const text = results[0]?.result;
    return typeof text === "string" ? text : null;
  }

  const tabsApi = browser.tabs as typeof browser.tabs & {
    executeScript?: (tabId: number, details: { file: string }) => Promise<unknown[]>;
  };

  if (typeof tabsApi.executeScript === "function") {
    const results = await tabsApi.executeScript(tabId, {
      file: PAGE_TEXT_EXTRACTOR_SCRIPT,
    });
    const text = results?.[0];
    return typeof text === "string" ? text : null;
  }

  throw new Error("Script injection is not supported in this browser.");
}

export async function readPageTextFromTab(
  tabId: number,
  url?: string,
): Promise<{ ok: true; text: string; tabId: number } | { ok: false; error: string }> {
  if (isRestrictedPageUrl(url)) {
    return { ok: false, error: "This page cannot be read." };
  }

  try {
    const text = await injectPageTextExtractor(tabId);
    const normalized = text ? normalizeWhitespace(text) : "";

    if (!normalized) {
      return { ok: false, error: "No readable text found on this page." };
    }

    return { ok: true, text: normalized, tabId };
  } catch (error) {
    console.warn("Failed to read page text", error);
    return { ok: false, error: "This page cannot be read." };
  }
}

export async function readActivePageText(): Promise<
  { ok: true; text: string; tabId: number } | { ok: false; error: string }
> {
  const tab = await getActiveTab();
  const tabId = tab?.id;

  if (tabId === undefined) {
    return { ok: false, error: "No active tab found." };
  }

  return readPageTextFromTab(tabId, tab.url);
}
