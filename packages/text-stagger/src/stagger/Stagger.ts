import {
  ParsedTextOptions,
  resolveTextSplitter,
  Text,
  TextOptions,
  TextSplitterOptions,
} from "../text/index.js";

export enum ScanReason {
  Resize = "resize",
  Mounted = "mounted",
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

export interface MountedScanEvent {
  reason: ScanReason.Mounted;
}

export interface ResizeScanEvent {
  reason: ScanReason.Resize;
  entries: ResizeObserverEntry[];
}

export type ScanEvent =
  | MountedScanEvent
  | MutationScanEvent
  | ResizeScanEvent
  | ForceScanEvent;

export class Stagger {
  #ignoreMutations = new WeakSet<HTMLElement>();
  #pixelCache = new WeakMap<HTMLElement, Map<string, number>>();

  #options!: ParsedTextOptions;
  #optionsListeners = new Set<(options: ParsedTextOptions) => void>();

  #textsListeners = new Set<() => void>();
  texts = new Map<number, Text>();

  constructor(options?: TextOptions) {
    this.options = options;
  }

  get options(): ParsedTextOptions {
    return this.#options;
  }

  set options(options: TextOptions | undefined) {
    this.#options = resolveTextSplitter<ParsedTextOptions>(
      { visualDebug: false, disabled: false },
      options
    );

    this.#optionsListeners.forEach((listener) => listener(this.options));
  }

  onDidChangeOptions(listener: (options: ParsedTextOptions) => void) {
    this.#optionsListeners.add(listener);

    return () => {
      this.#optionsListeners.delete(listener);
    };
  }

  onDidChangeTexts(listener: () => void) {
    this.#textsListeners.add(listener);

    return () => {
      this.#textsListeners.delete(listener);
    };
  }

  getText(id: number) {
    return this.texts.get(id) ?? null;
  }

  observeText(
    element: HTMLElement,
    id: number,
    splitterOptions: TextSplitterOptions,
    cb?: (event: ScanEvent) => void
  ) {
    let text = Text.scanText(this, id, element, splitterOptions);

    this.texts.set(id, text);
    this.#textsListeners.forEach((listener) => listener());

    let scanner: ReturnType<typeof requestAnimationFrame> | undefined;

    const scan = (event: ScanEvent) => {
      if (scanner && event.reason !== ScanReason.Mutation) {
        return;
      }

      console.time("scan " + event.reason);
      text.scanElementLines(event);
      console.timeEnd("scan " + event.reason);

      cb?.(event);

      scanner = requestAnimationFrame(() => {
        scanner = undefined;
      });
    };

    const resizeObserver = new ResizeObserver((entries) => {
      scan({ reason: ScanReason.Resize, entries });
    });

    resizeObserver.observe(element);

    const mutationObserver = new MutationObserver((entries) => {
      if (this.#ignoreMutations.delete(element)) {
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

    const dispose = () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      this.texts.delete(id);
      this.#textsListeners.forEach((listener) => listener());
    };

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
      this.#pixelCache.delete(element);
    } else {
      this.#pixelCache = new WeakMap();
    }
  }

  skipMutation(element: HTMLElement) {
    this.#ignoreMutations.add(element);
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

    let elementPixelCache = this.#pixelCache.get(element);
    if (!elementPixelCache) {
      elementPixelCache = new Map();
      this.#pixelCache.set(element, elementPixelCache);
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
