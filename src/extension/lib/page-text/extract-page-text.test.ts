import { describe, expect, test } from "bun:test";
import { extractPageText, MIN_MAIN_CONTENT_CHARS, normalizeWhitespace } from "./extract-page-text";

interface TestElement {
  tagName: string;
  children: TestNode[];
  parent: TestElement | null;
  attributes: Map<string, string>;
  style: Record<string, string>;
  inViewport: boolean;
}

interface TestTextNode {
  kind: "text";
  text: string;
  parent: TestElement | null;
}

type TestNode = TestElement | TestTextNode;

function isElement(node: TestNode): node is TestElement {
  return !("kind" in node);
}

function createElement(tagName: string, parent: TestElement | null = null): TestElement {
  const element: TestElement = {
    tagName: tagName.toUpperCase(),
    children: [],
    parent,
    attributes: new Map(),
    style: {},
    inViewport: true,
  };
  parent?.children.push(element);
  return element;
}

function createText(text: string, parent: TestElement): TestTextNode {
  const node: TestTextNode = { kind: "text", text, parent };
  parent.children.push(node);
  return node;
}

function setAttr(element: TestElement, name: string, value: string): void {
  element.attributes.set(name, value);
}

function createTestDocument(root: TestElement): Document {
  const window = {
    innerWidth: 1024,
    innerHeight: 768,
    getComputedStyle(element: unknown): CSSStyleDeclaration {
      const testElement = (element as Element & { __testElement?: TestElement }).__testElement;
      const display = testElement?.style.display ?? "block";
      const visibility = testElement?.style.visibility ?? "visible";
      return { display, visibility } as CSSStyleDeclaration;
    },
  };

  const elementCache = new Map<TestElement, Element>();
  const documentHolder: { current: Document | null } = { current: null };

  const domElement = (node: TestElement): Element => {
    const cached = elementCache.get(node);
    if (cached) {
      return cached;
    }

    const element = {
      tagName: node.tagName,
      __testElement: node,
      get parentElement() {
        return node.parent ? domElement(node.parent) : null;
      },
      get ownerDocument() {
        return documentHolder.current!;
      },
      getAttribute(name: string) {
        return node.attributes.get(name) ?? null;
      },
      getBoundingClientRect() {
        if (!node.inViewport) {
          return { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 } as DOMRect;
        }
        return { width: 100, height: 20, top: 0, left: 0, right: 100, bottom: 20 } as DOMRect;
      },
      querySelector(selector: string): Element | null {
        return queryAll(selector)[0] ?? null;
      },
      querySelectorAll(selector: string): Element[] {
        return queryAll(selector);
      },
    } as unknown as Element;

    function queryAll(selector: string): Element[] {
      const results: Element[] = [];
      const visit = (current: TestNode) => {
        if (!isElement(current)) {
          return;
        }
        const dom = domElement(current);
        if (selector === "main" && current.tagName === "MAIN") {
          results.push(dom);
        } else if (selector === '[role="main"]' && current.attributes.get("role") === "main") {
          results.push(dom);
        } else if (selector === "article" && current.tagName === "ARTICLE") {
          results.push(dom);
        }
        for (const child of current.children) {
          visit(child);
        }
      };
      visit(root);
      return results;
    }

    elementCache.set(node, element);
    return element;
  };

  function findTestElement(node: TestElement, domNode: Element): TestElement {
    if (domElement(node) === domNode) {
      return node;
    }
    for (const child of node.children) {
      if (isElement(child)) {
        const found = findTestElement(child, domNode);
        if (found) {
          return found;
        }
      }
    }
    return node;
  }

  const bodyDom = domElement(root);
  documentHolder.current = {
    body: bodyDom,
    defaultView: window,
    querySelector(selector: string) {
      return bodyDom.querySelector(selector);
    },
    querySelectorAll(selector: string) {
      return bodyDom.querySelectorAll(selector);
    },
    createTreeWalker(rootNode: Element): TreeWalker {
      const testRoot = findTestElement(root, rootNode);
      const textNodes: TestTextNode[] = [];

      const visit = (current: TestNode) => {
        if ("kind" in current && current.kind === "text") {
          textNodes.push(current);
          return;
        }
        if (isElement(current)) {
          for (const child of current.children) {
            visit(child);
          }
        }
      };

      visit(testRoot);

      let index = -1;
      return {
        nextNode() {
          index += 1;
          const textNode = textNodes[index];
          if (!textNode) {
            return null;
          }
          return {
            textContent: textNode.text,
            parentElement: textNode.parent ? domElement(textNode.parent) : null,
          } as Text;
        },
      } as TreeWalker;
    },
  } as unknown as Document;

  return documentHolder.current;
}

function longParagraph(repeat = 30): string {
  return "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(repeat);
}

describe("normalizeWhitespace", () => {
  test("collapses runs and trims", () => {
    expect(normalizeWhitespace("  hello   world  ")).toBe("hello world");
  });
});

describe("extractPageText", () => {
  test("prefers main when it has substantial content", () => {
    const body = createElement("body");
    const nav = createElement("nav", body);
    createText("Navigation links here", nav);
    const main = createElement("main", body);
    createText(longParagraph(), main);
    const footer = createElement("footer", body);
    createText("Footer text", footer);

    const text = extractPageText(createTestDocument(body));
    expect(text).toContain("Lorem ipsum");
    expect(text).not.toContain("Navigation links");
    expect(text).not.toContain("Footer text");
  });

  test("uses role=main when main tag is absent", () => {
    const body = createElement("body");
    const roleMain = createElement("div", body);
    setAttr(roleMain, "role", "main");
    createText(longParagraph(), roleMain);

    const text = extractPageText(createTestDocument(body));
    expect(text).toContain("Lorem ipsum");
  });

  test("uses dominant article when no main is present", () => {
    const body = createElement("body");
    const sidebar = createElement("aside", body);
    createText("Short sidebar", sidebar);
    const article = createElement("article", body);
    createText(longParagraph(), article);

    const doc = createTestDocument(body);
    expect(doc.querySelectorAll("article").length).toBe(1);

    const text = extractPageText(doc);
    expect(text).toContain("Lorem ipsum");
    expect(text).not.toContain("Short sidebar");
  });

  test("falls back to visible body text excluding chrome", () => {
    const body = createElement("body");
    const nav = createElement("nav", body);
    createText("Nav area", nav);
    const content = createElement("div", body);
    createText(longParagraph(), content);
    const footer = createElement("footer", body);
    createText("Footer area", footer);

    const text = extractPageText(createTestDocument(body));
    expect(text).toContain("Lorem ipsum");
    expect(text).not.toContain("Nav area");
    expect(text).not.toContain("Footer area");
  });

  test("skips hidden elements", () => {
    const body = createElement("body");
    const main = createElement("main", body);
    createText(longParagraph(), main);
    const hidden = createElement("p", main);
    hidden.style.display = "none";
    createText("Hidden secret text", hidden);

    const text = extractPageText(createTestDocument(body));
    expect(text).toContain("Lorem ipsum");
    expect(text).not.toContain("Hidden secret");
  });

  test("returns empty string when page has no readable text", () => {
    const body = createElement("body");
    const nav = createElement("nav", body);
    createText("Only navigation", nav);

    expect(extractPageText(createTestDocument(body))).toBe("");
  });

  test("ignores main with insufficient content", () => {
    const body = createElement("body");
    const main = createElement("main", body);
    createText("Too short", main);
    const article = createElement("article", body);
    createText(longParagraph(), article);

    const text = extractPageText(createTestDocument(body));
    expect(text.length).toBeGreaterThanOrEqual(MIN_MAIN_CONTENT_CHARS);
    expect(text).toContain("Lorem ipsum");
  });
});
