import {
  resolveTextSplitter,
  Text,
  TextOptions,
  TextSplitterOptions,
} from "../text/index.js";

export enum ScanReason {
  Resize = "resize",
  Mutation = "mutation",
  Force = "force",
}

export interface ForceScanEvent {
  reason: ScanReason.Force;
  data?: any;
}

export interface MutationScanEvent {
  reason: ScanReason.Mutation;
  entries: MutationRecord[];
}

export interface ResizeScanEvent {
  reason: ScanReason.Resize;
  entries: ResizeObserverEntry[];
}

export type ScanEvent = MutationScanEvent | ResizeScanEvent | ForceScanEvent;

export class Stagger {
  private ignoreMutations = new WeakSet<HTMLElement>();
  private pixelCache = new WeakMap<HTMLElement, Map<string, number>>();

  options: TextOptions;

  constructor(public streaming: boolean | null, options?: TextSplitterOptions) {
    this.options = resolveTextSplitter(options);
  }

  observeText(
    element: HTMLDivElement,
    id: number,
    splitterOptions: TextSplitterOptions,
    cb?: (event: ScanEvent) => void
  ) {
    let text = Text.scanText(this, id, element, splitterOptions);

    let scanner: ReturnType<typeof requestAnimationFrame> | undefined;

    const scan = (event: ScanEvent) => {
      scanner ??= requestAnimationFrame(() => {
        console.time("scan " + event.reason);
        text.scanElementLines(event);
        console.timeEnd("scan " + event.reason);

        scanner = undefined;

        cb?.(event);
      });
    };

    const resizeObserver = new ResizeObserver((entries) => {
      scan({ reason: ScanReason.Resize, entries });
    });

    resizeObserver.observe(element);

    const mutationObserver = new MutationObserver((entries) => {
      if (this.ignoreMutations.delete(element)) {
        return;
      }

      scan({ reason: ScanReason.Mutation, entries });
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

    return {
      text,
      dispose,
      scan(data: any) {
        scan({ reason: ScanReason.Force, data });
      },
    };
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
