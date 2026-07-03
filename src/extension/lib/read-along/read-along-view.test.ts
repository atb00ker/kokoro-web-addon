import { beforeAll, describe, expect, test } from "bun:test";
import { mountReadAlongView } from "./read-along-view";

function installMinimalDom(): void {
  const elements: Array<{
    className: string;
    dataset: Record<string, string>;
    replaceChildren: () => void;
    appendChild: (node: unknown) => void;
    addEventListener: () => void;
    classList: { add: () => void; toggle: () => void };
    querySelector: () => null;
  }> = [];

  globalThis.document = {
    createElement: () => {
      const element = {
        className: "",
        dataset: {} as Record<string, string>,
        replaceChildren: () => {},
        appendChild: () => {},
        addEventListener: () => {},
        classList: { add: () => {}, toggle: () => {} },
        querySelector: () => null,
      };
      elements.push(element);
      return element;
    },
    createTextNode: () => ({}),
    createDocumentFragment: () => ({
      appendChild: () => {},
    }),
  } as unknown as Document;
}

describe("mountReadAlongView search", () => {
  beforeAll(() => {
    installMinimalDom();
  });

  test("computes search matches once per query update", () => {
    const container = {
      classList: { add: () => {} },
      replaceChildren: () => {},
      appendChild: () => {},
      querySelector: () => null,
    } as unknown as HTMLElement;

    const view = mountReadAlongView(container);

    view.update({
      chunks: ["alpha beta gamma", "beta delta"],
      activeChunkIndex: null,
    });

    const first = view.setSearchQuery("beta", false);
    expect(first).toEqual({ position: 1, total: 2 });

    view.goToNextSearchMatch();
    expect(view.getSearchMatchCount()).toEqual({ position: 2, total: 2 });

    view.clearSearch();
    expect(view.getSearchMatchCount()).toBeNull();
  });
});
