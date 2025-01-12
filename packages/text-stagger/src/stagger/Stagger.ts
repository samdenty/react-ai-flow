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
  reset?: boolean;
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
  #painter?: ReturnType<typeof requestAnimationFrame>;
  #paintQueue = new Set<Text>();
  #texts = new Map<number, { text: Text; dispose: VoidFunction }>();

  constructor(options?: TextOptions) {
    this.options = options;
  }

  toString() {
    return this.texts.join("");
  }

  get texts() {
    return [...this.#texts.values()].map(({ text }) => text);
  }

  get elements() {
    return this.texts.flatMap((text) => text.elements);
  }

  cancelPaint() {
    if (this.#painter) {
      cancelAnimationFrame(this.#painter);
      this.#painter = undefined;
    }
  }

  paint() {
    const elements = [...this.elements];
    const element = elements.find((element) => element.progress !== 1);

    if (!element) {
      return false;
    }

    this.#paintQueue.add(element.text);

    const paintQueue = [...this.#paintQueue];

    this.#paintQueue.clear();

    element.progress = Math.min(1, element.progress + 0.035);

    for (const text of paintQueue) {
      text.paint();
    }

    return elements.some((element) => element.progress !== 1);
  }

  requestPaint(texts = this.texts) {
    this.cancelPaint();

    for (const text of texts) {
      this.#paintQueue.add(text);
    }

    this.#painter = requestAnimationFrame(() => {
      if (this.paint()) {
        this.requestPaint([]);
      }
    });
  }

  static classNamePrefix = "text-stagger";

  get options(): ParsedTextOptions {
    return this.#options;
  }

  set options(options: TextOptions | undefined) {
    this.#options = resolveTextSplitter<ParsedTextOptions>(
      {
        visualDebug: false,
        disabled: false,
        classNamePrefix: Stagger.classNamePrefix,
      },
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

  getText(id: number): Text | null {
    return this.#texts.get(id)?.text ?? null;
  }

  disposeText(id: number) {
    const { dispose } = this.#texts.get(id) || {};

    dispose?.();
  }

  scanText({ id, ...props }: { id?: number } & (ScanEvent | {}) = {}) {
    const event: ScanEvent =
      "reason" in props ? props : { reason: ScanReason.Force };

    const texts = id == null ? this.texts : [this.getText(id)];

    texts.forEach((text) => {
      if (!text?.relativeTo) {
        return;
      }

      return text.scanElementLines(text.relativeTo.element, event);
    });
  }

  observeText(
    element: HTMLElement,
    id: number,
    textOptions: TextSplitterOptions
  ) {
    const resizeObserver = new ResizeObserver((entries) => {
      scan({ reason: ScanReason.Resize, entries });
    });

    const mutationObserver = new MutationObserver((entries) => {
      if (this.#ignoreMutations.delete(element)) {
        return;
      }

      entries = entries.filter((entry) => entry.target !== text.canvas);

      if (!entries.length) {
        return;
      }

      scan({ reason: ScanReason.Mutation, entries });
    });

    const text = Text.scanText(this, id, element, textOptions);

    let scanner: ReturnType<typeof requestAnimationFrame> | undefined;

    const scan = (event: ScanEvent) => {
      if (scanner && event.reason !== ScanReason.Mutation) {
        return;
      }

      console.time("scan " + event.reason);
      text.scanElementLines(element, event);
      console.timeEnd("scan " + event.reason);

      this.requestPaint([text]);

      scanner = requestAnimationFrame(() => {
        scanner = undefined;
      });
    };

    resizeObserver.observe(element);

    mutationObserver.observe(element, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    const dispose = () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      this.#texts.delete(id);
      this.#textsListeners.forEach((listener) => listener());
    };

    const texts = [...this.#texts, [id, { text, dispose }] as const];

    for (const [, { text }] of texts) {
      if (!text.relativeTo) {
        continue;
      }

      text.relativeTo.rect = text.relativeTo.element.getBoundingClientRect();
    }

    texts.sort(
      ([, { text: a }], [, { text: b }]) => a.top - b.top + (a.left - b.left)
    );

    this.#texts = new Map(texts);

    this.#textsListeners.forEach((listener) => listener());

    return dispose;
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
