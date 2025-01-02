import {
  getTextSplitterWithDefaults,
  Text,
  TextOptions,
  TextSplitterOptions,
} from "../text/index.js";

export class Stagger {
  private ignoreMutations = new WeakSet<HTMLElement>();
  private pixelCache = new WeakMap<HTMLElement, Map<string, number>>();

  options: TextOptions;

  constructor(public streaming: boolean | null, options?: TextSplitterOptions) {
    this.options = getTextSplitterWithDefaults(options);
  }

  observeText(
    element: HTMLDivElement,
    id: number,
    splitterOptions: TextSplitterOptions,
    cb?: (
      event:
        | { type: "resize"; entries: ResizeObserverEntry[] }
        | { type: "mutation"; entries: MutationRecord[] }
    ) => void
  ) {
    let text = Text.scanText(this, id, element, splitterOptions);

    const resizeObserver = new ResizeObserver((entries) => {
      console.log("resize");
      console.time("scan");
      // const text = this.scanText(element, splitterOptions);
      console.timeEnd("scan");

      cb?.({ type: "resize", entries });
    });

    resizeObserver.observe(element);

    const mutationObserver = new MutationObserver((entries) => {
      if (this.ignoreMutations.delete(element)) {
        return;
      }

      const addedNodes: Node[] = [];

      for (const entry of entries) {
        if (entry.type === "childList") {
          addedNodes.push(...entry.addedNodes);
        }
      }

      const firstLineWithMutation = text.lines.findIndex((line) => {
        return line.ranges.some((range) => {
          return addedNodes.some((node) =>
            range.intersectsNode(node.previousSibling ?? node.parentElement!)
          );
        });
      });

      console.log(text.lines.length, "skip until ", firstLineWithMutation);
      console.time("scan");

      // const text2 = this.scanText(element, splitterOptions);
      console.timeEnd("scan");

      cb?.({ type: "mutation", entries });
    });

    mutationObserver.observe(element, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    function dispose() {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    }

    return { text, dispose };
  }

  invalidateElementCache(element?: HTMLElement) {
    if (element) {
      this.pixelCache.delete(element);
    } else {
      this.pixelCache = new WeakMap();
    }
  }

  skipMutation(element: HTMLElement) {
    this.ignoreMutations.add(element);
  }

  convertToPx(
    cssLiteral: string | number,
    { height, width }: { height: number; width: number },
    element = document.body
  ) {
    if (typeof cssLiteral === "number") {
      return cssLiteral;
    }

    const key = `${height}:${width}:${cssLiteral}`;

    let elementPixelCache = this.pixelCache.get(element);
    if (!elementPixelCache) {
      elementPixelCache = new Map();
      this.pixelCache.set(element, elementPixelCache);
    }

    if (!elementPixelCache.has(key)) {
      this.skipMutation(element);
      const container = document.createElement("div");
      container.style.height = `${height}px`;
      container.style.width = `${width}px`;

      const target = document.createElement("div");
      target.style.width = cssLiteral;
      container.appendChild(target);
      element.appendChild(container);

      elementPixelCache.set(key, target.offsetWidth);

      element.removeChild(container);
    }

    return elementPixelCache.get(key)!;
  }
}
