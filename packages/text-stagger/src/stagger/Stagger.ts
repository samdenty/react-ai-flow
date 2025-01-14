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
  #options!: ParsedStaggerOptions;
  #optionsListeners = new Set<(options: ParsedStaggerOptions) => void>();
  #streaming: boolean | null = null;

  #textsListeners = new Set<() => void>();
  #painter?: ReturnType<typeof requestAnimationFrame>;
  #paintQueue = new Set<Text>();
  #texts = new Map<number, { text: Text; dispose: VoidFunction }>();
  #recreationProgresses = new Map<number, number>();

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
    this.requestAnimation();
  }

  toString() {
    return this.texts.join("");
  }

  get texts() {
    return [...this.#texts.values()].map(({ text }) => text);
  }

  get elements() {
    const elements = this.texts.flatMap((text) => {
      if (!text.container) {
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
      element.progress = Math.min(1, element.progress + 0.01);

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

  requestAnimation(texts = this.texts) {
    this.cancelPaint();

    for (const text of texts) {
      this.#paintQueue.add(text);
    }

    this.#painter = requestAnimationFrame(() => {
      if (this.paint([])) {
        this.requestAnimation([]);
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
      if (!text) {
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
    const text = new Text(
      this,
      id,
      element,
      mergeTextSplitter<ParsedTextOptions>(this.options, textOptions)
    );

    const recreatedProgress = this.#recreationProgresses.get(id);

    if (recreatedProgress) {
      text.progress = recreatedProgress;
    }

    const dispose = () => {
      text.dispose();
      this.#recreationProgresses.set(id, text.progress);
      this.#texts.delete(id);
      this.#textsListeners.forEach((listener) => listener());
    };

    this.#texts.set(id, { text, dispose });
    this.#textsListeners.forEach((listener) => listener());

    return dispose;
  }
}

export enum ScanReason {
  Resize = "resize",
  Mounted = "mounted",
  Mutation = "mutation",
  Force = "force",
}

export interface ForcedScanEvent {
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
  | ForcedScanEvent;
