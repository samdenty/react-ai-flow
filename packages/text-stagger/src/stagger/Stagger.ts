import {
  mergeTextSplitter,
  type ParsedTextOptions,
  resolveTextSplitter,
  Text,
  type TextOptions,
  type TextSplitterOptions,
} from "../text/index.js";

export interface StaggerOptions extends TextOptions {}
export interface ParsedStaggerOptions extends ParsedTextOptions {}

export class Stagger {
  #ignoreMutations = new WeakSet<HTMLElement>();
  #pixelCache = new WeakMap<HTMLElement, Map<string, number>>();

  #options!: ParsedStaggerOptions;
  #optionsListeners = new Set<(options: ParsedStaggerOptions) => void>();
  #streaming: boolean | null = null;

  #textsListeners = new Set<() => void>();
  #painter?: ReturnType<typeof requestAnimationFrame>;
  #paintQueue = new Set<Text>();
  #texts = new Map<number, { text: Text; dispose: VoidFunction }>();

  constructor(options?: StaggerOptions) {
    this.options = options;
  }

  get streaming() {
    return this.#streaming;
  }

  set streaming(streaming: boolean | null) {
    if (streaming === this.#streaming) {
      return;
    }

    this.#streaming = streaming;
    this.requestPaint();
  }

  toString() {
    return this.texts.join("");
  }

  get texts() {
    return [...this.#texts.values()].map(({ text }) => text);
  }

  get elements() {
    const elements = this.texts.flatMap((text) => {
      if (!text.relativeTo) {
        return [];
      }

      text.updateBounds();

      return text.elements.map((element) => ({
        element,
        top: text.top + element.top,
        left: text.left + element.left,
      }));
    });

    elements.sort((a, b) => {
      // First sort by top position
      if (a.top !== b.top) {
        return a.top - b.top;
      }

      // If top positions are equal, sort by left position
      return a.left - b.left;
    });

    return elements.map(({ element }) => element);
  }

  cancelPaint() {
    if (this.#painter) {
      cancelAnimationFrame(this.#painter);
      this.#painter = undefined;
    }
  }

  paint(texts = this.texts) {
    const elements = [...this.elements];
    const element = elements.find((element) => element.progress !== 1);

    texts.forEach((text) => this.#paintQueue.add(text));

    if (element) {
      const oldProgress = element.progress;
      element.progress = Math.min(1, element.progress + 0.05);

      if (oldProgress !== element.progress) {
        this.#paintQueue.add(element.text);
      }
    }

    const paintQueue = [...this.#paintQueue];

    if (!paintQueue.length) {
      return false;
    }

    this.#paintQueue.clear();

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
      if (this.paint([])) {
        this.requestPaint([]);
      }
    });
  }

  static classNamePrefix = "text-stagger";

  get options(): ParsedStaggerOptions {
    return this.#options;
  }

  set options(options: StaggerOptions | undefined) {
    this.#options = resolveTextSplitter<ParsedStaggerOptions>(
      {
        visualDebug: false,
        disabled: false,
        classNamePrefix: Stagger.classNamePrefix,
      },
      options
    );

    this.#optionsListeners.forEach((listener) => listener(this.options));
  }

  onDidChangeOptions(listener: (options: ParsedStaggerOptions) => void) {
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

      return text.scanElementLines(event);
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

    const text = new Text(
      this,
      id,
      element,
      mergeTextSplitter<ParsedTextOptions>(this.options, textOptions)
    );

    let scanner: ReturnType<typeof requestAnimationFrame> | undefined;

    const scan = (event: ScanEvent) => {
      if (scanner && event.reason !== ScanReason.Mutation) {
        return;
      }

      text.scanElementLines(event);

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
      text.dispose();

      this.#texts.delete(id);
      this.#textsListeners.forEach((listener) => listener());
    };

    this.#texts.set(id, { text, dispose });
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
