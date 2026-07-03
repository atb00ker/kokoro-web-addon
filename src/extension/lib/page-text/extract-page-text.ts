export const MIN_MAIN_CONTENT_CHARS = 200;

const SHOW_TEXT = 4;

const CHROME_TAGS = new Set(["NAV", "HEADER", "FOOTER", "ASIDE"]);
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG"]);

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isHiddenElement(element: Element): boolean {
  if (element.getAttribute("aria-hidden") === "true") {
    return true;
  }

  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (style && (style.display === "none" || style.visibility === "hidden")) {
    return true;
  }

  const rect = element.getBoundingClientRect();
  return rect.width === 0 && rect.height === 0;
}

function isInViewport(element: Element, window: Window): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.bottom > 0 &&
    rect.top < window.innerHeight &&
    rect.right > 0 &&
    rect.left < window.innerWidth
  );
}

function shouldSkipElement(element: Element, options: { excludeChrome: boolean }): boolean {
  const tag = element.tagName;
  if (SKIP_TAGS.has(tag)) {
    return true;
  }

  if (options.excludeChrome && CHROME_TAGS.has(tag)) {
    return true;
  }

  return isHiddenElement(element);
}

function collectVisibleText(
  root: Element,
  window: Window,
  options: { excludeChrome: boolean; viewportOnly: boolean },
): string {
  const parts: string[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, SHOW_TEXT);

  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (parent && !shouldSkipElement(parent, options)) {
      let excluded = false;
      let ancestor: Element | null = parent;
      while (ancestor && ancestor !== root) {
        if (shouldSkipElement(ancestor, options)) {
          excluded = true;
          break;
        }
        if (options.viewportOnly && !isInViewport(ancestor, window)) {
          excluded = true;
          break;
        }
        ancestor = ancestor.parentElement;
      }

      if (!excluded && (!options.viewportOnly || isInViewport(parent, window))) {
        const text = node.textContent ?? "";
        if (text.trim()) {
          parts.push(text);
        }
      }
    }

    node = walker.nextNode();
  }

  return normalizeWhitespace(parts.join(" "));
}

function getVisibleTextLength(element: Element, window: Window): number {
  return collectVisibleText(element, window, { excludeChrome: false, viewportOnly: false }).length;
}

function isClearlyMainContent(element: Element, window: Window): boolean {
  const textLength = getVisibleTextLength(element, window);
  if (textLength < MIN_MAIN_CONTENT_CHARS) {
    return false;
  }

  const nestedArticle = element.querySelector("article");
  if (nestedArticle) {
    const articleLength = getVisibleTextLength(nestedArticle, window);
    if (articleLength > textLength * 0.8) {
      return false;
    }
  }

  return true;
}

function findMainCandidate(document: Document): Element | null {
  const window = document.defaultView;
  if (!window) {
    return null;
  }

  const mainElements = document.querySelectorAll("main");
  let bestMain: Element | null = null;
  let bestLength = 0;

  for (const main of mainElements) {
    if (!isClearlyMainContent(main, window)) {
      continue;
    }

    const length = getVisibleTextLength(main, window);
    if (length > bestLength) {
      bestMain = main;
      bestLength = length;
    }
  }

  if (bestMain) {
    return bestMain;
  }

  const roleMainElements = document.querySelectorAll('[role="main"]');
  for (const roleMain of roleMainElements) {
    if (!isClearlyMainContent(roleMain, window)) {
      continue;
    }

    const length = getVisibleTextLength(roleMain, window);
    if (length > bestLength) {
      bestMain = roleMain;
      bestLength = length;
    }
  }

  return bestMain;
}

function findDominantArticle(document: Document): Element | null {
  const window = document.defaultView;
  const body = document.body;
  if (!window || !body) {
    return null;
  }

  const bodyLength = getVisibleTextLength(body, window);
  if (bodyLength === 0) {
    return null;
  }

  const articles = document.querySelectorAll("article");
  let bestArticle: Element | null = null;
  let bestLength = 0;

  for (const article of articles) {
    const length = getVisibleTextLength(article, window);
    if (length > bestLength) {
      bestArticle = article;
      bestLength = length;
    }
  }

  if (bestArticle && bestLength >= MIN_MAIN_CONTENT_CHARS && bestLength >= bodyLength * 0.5) {
    return bestArticle;
  }

  return null;
}

export function extractPageText(document: Document): string {
  const window = document.defaultView;
  const body = document.body;
  if (!window || !body) {
    return "";
  }

  const mainCandidate = findMainCandidate(document);
  if (mainCandidate) {
    return collectVisibleText(mainCandidate, window, {
      excludeChrome: false,
      viewportOnly: false,
    });
  }

  const articleCandidate = findDominantArticle(document);
  if (articleCandidate) {
    return collectVisibleText(articleCandidate, window, {
      excludeChrome: false,
      viewportOnly: false,
    });
  }

  return collectVisibleText(body, window, {
    excludeChrome: true,
    viewportOnly: true,
  });
}
