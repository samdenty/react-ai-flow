import { mergeVibrations, type Vibration } from "ios-vibrator-pro-max";
import {
  mergeTextSplitter,
  type ParsedTextOptions,
  resolveTextSplitter,
  Text,
  type TextOptions,
  type TextSplitterOptions,
} from "../text/index.js";
import type { StaggerElement } from "./StaggerElement.js";

export interface StaggerOptions extends TextOptions {
  streaming?: boolean | null;
}

export interface ParsedStaggerOptions extends ParsedTextOptions {}

declare global {
  var staggers: Stagger[] | undefined;
}

let ID = 0;

export class Stagger {
  #options!: ParsedStaggerOptions;
  #optionsListeners = new Set<(options: ParsedStaggerOptions) => void>();
  #paintListeners = new Set<() => void>();
  #streaming: boolean | null = null;

  #textsListeners = new Set<() => void>();
  #painter?: ReturnType<typeof requestAnimationFrame>;
  #paintQueue = new Set<Text>();
  #invalidateTexts = true;
  #vibration?: Vibration;

  #texts: Text[] = [];
  #elements?: StaggerElement[];

  batchId = 0;
  id = ++ID;
  lastPaint?: number;

  constructor({ streaming, ...options }: StaggerOptions = {}) {
    this.options = options;
    this.streaming = streaming ?? null;

    globalThis.staggers ??= [];
    globalThis.staggers.push(this);
  }

  dispose() {
    for (const text of this.texts) {
      text.dispose();
    }

    if (globalThis.staggers) {
      globalThis.staggers = globalThis.staggers.filter(
        (stagger) => stagger !== this
      );
    }
  }

  get width() {
    return Math.max(...this.texts.map((text) => text.width));
  }

  /**
   * Allows you to hint to whether the stagger is currently streaming a response.
   *
   * If `null`, the streaming state is unknown.
   * If `true` then certain streaming only enhancements are enabled.
   * If `false` the streaming enhancements are disabled.
   *
   * @default null (unknown/disabled)
   */
  get streaming() {
    return this.#streaming;
  }

  set streaming(streaming: boolean | null) {
    if (streaming === this.#streaming) {
      return;
    }

    const previousStreaming = this.#streaming;
    this.#streaming = streaming;
    this.requestAnimation(this.texts);

    if (previousStreaming === true && !streaming) {
      for (const text of this.texts) {
        text.revealTrailing();
      }
    }
  }

  toString() {
    return this.texts.join("");
  }

  get texts() {
    if (this.#invalidateTexts) {
      this.#texts.sort((a, b) => {
        return a.comparePosition(b);
      });

      this.#invalidateTexts = false;
    }

    return this.#texts;
  }

  get elements() {
    if (!this.#elements) {
      this.#elements = this.texts.flatMap((text) => text.elements);
      this.#elements.sort((a, b) => {
        return a.comparePosition(b);
      });
    }

    return this.#elements;
  }

  invalidatePositions() {
    this.#invalidateTexts = true;
    this.#elements = undefined;
  }

  cancelPaint() {
    if (this.#painter) {
      cancelAnimationFrame(this.#painter);
      this.#painter = undefined;
    }
  }

  vibrate(vibrations: number[]) {
    if (!isTouchDevice()) {
      return;
    }

    if (this.#vibration) {
      vibrations = mergeVibrations([Date.now(), vibrations], this.#vibration);
    }

    this.#vibration = [Date.now(), vibrations];

    navigator.vibrate(vibrations);
  }

  paint(texts: Text[] = []) {
    const now = Date.now();

    const paintQueue = new Set([...this.#paintQueue, ...texts]);
    this.#paintQueue.clear();

    const skippedFrames = new Set<Text>();

    for (const element of this.elements) {
      const elapsed = now - element.startTime - element.delay;

      if (elapsed < 0 || element.progress === 1) {
        continue;
      }

      if (element.text.shouldSkipFrame) {
        skippedFrames.add(element.text);
        continue;
      }

      const oldProgress = element.progress;
      element.progress = Math.min(1, elapsed / element.duration);

      if (oldProgress !== element.progress) {
        if (oldProgress === 0 && element.vibration) {
          this.vibrate(element.vibration);
        }

        paintQueue.add(element.text);
      }
    }

    for (const text of this.texts) {
      if (text.updateBoundsOnPaint && !skippedFrames.has(text)) {
        text.updateBounds();
      }
    }

    if (paintQueue.size) {
      for (const text of paintQueue) {
        if (text.parent instanceof Text) {
          text.parent.paint();
        }

        text.paint();
      }

      this.#paintListeners.forEach((listener) => listener());
    }

    return (
      skippedFrames.size ||
      this.elements.some((element) => element.progress !== 1)
    );
  }

  requestAnimation(force: Text[] = []) {
    for (const text of force) {
      this.#paintQueue.add(text);
    }

    this.#painter ??= requestAnimationFrame(() => {
      this.batchId++;
      this.#painter = undefined;

      if (this.paint()) {
        this.requestAnimation();
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
        maxFps: null,
        disabled: false,
        classNamePrefix: Stagger.classNamePrefix,
        delayTrailing: false,
        vibration: [0, "70%", 10],
        stagger: "100%",
      },
      options
    );

    this.#optionsListeners.forEach((listener) => listener(this.options));
  }

  onDidPaint(listener: () => void) {
    this.#paintListeners.add(listener);

    return () => {
      this.#paintListeners.delete(listener);
    };
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
    return this.texts.find((text) => text.id === id) ?? null;
  }

  disposeText(id: number) {
    const text = this.getText(id);
    if (!text) {
      return;
    }

    text.dispose();

    this.texts.splice(this.texts.indexOf(text), 1);
    this.#textsListeners.forEach((listener) => listener());
  }

  scanText({ id, ...props }: { id?: number } & (ScanEvent | {}) = {}) {
    const event: ScanEvent =
      "reason" in props ? props : { reason: ScanReason.Force };

    const texts = id == null ? this.texts : [this.getText(id)];

    texts.forEach((text) => {
      text?.scanElementLines(event);
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

    this.texts.push(text);
    this.#textsListeners.forEach((listener) => listener());

    return () => this.disposeText(id);
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

function isTouchDevice() {
  return (
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    (navigator as any).msMaxTouchPoints > 0
  );
}
