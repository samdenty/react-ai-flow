import {
  StaggerElementBox,
  type StaggerElementBoxOptions,
  StaggerElement,
  type SerializedStaggerElement,
  type ElementOptions,
} from "../stagger/index.js";
import { Ranges, type RangesChildNode } from "./Ranges.js";
import { type ScanEvent, ScanReason, Stagger } from "../stagger/Stagger.js";
import { TextLine } from "./TextLine.js";
import {
  type ParsedTextSplit,
  type SplitterImpl,
  type TextSplitterOptions,
} from "./TextSplitter.js";
import { calcSlices } from "fast-myers-diff";
import {
  CanvasMaskRenderMode,
  doPaint,
  maskRenderMode,
  updateProperty,
} from "./canvas/index.js";

const LAYOUT_AFFECTING_ATTRIBUTES = new Set([
  "style",
  "class",
  "width",
  "height",
  "font",
  "font-size",
  "font-family",
  "line-height",
  "white-space",
  "word-break",
  "word-wrap",
  "text-align",
  "direction",
  "writing-mode",
]);

export interface ParsedTextOptions
  extends SplitterImpl<TextSplitterOptions>,
    StaggerElementBoxOptions {
  visualDebug: boolean;
  disabled: boolean;
  classNamePrefix: string;
  delayTrailing: boolean;
  stagger: NonNullable<ElementOptions["stagger"]>;
}

export interface TextOptions extends TextSplitterOptions {
  /**
   * Display the canvas direclty instead of using mask-image,
   * useful for debugging
   * @default false
   */
  visualDebug?: boolean;

  /**
   * Disable the text from being animated
   */
  disabled?: boolean;

  /**
   * The class name prefix for the text
   * @default "text-stagger"
   */
  classNamePrefix?: string;

  /**
   * Delays animating the trailing element until the next element appears,
   * producing smoother animations by avoiding duplicate updates. When disabled,
   * the trailing element may flicker as it animates multiple times in response
   * to streaming updates targeting the same position.
   *
   * @requires stagger.streaming hints to be set correctly
   */
  delayTrailing?: boolean;
}

export class Text extends Ranges<StaggerElementBox, Stagger> {
  #mutationCache = new WeakMap<Node, number>();

  lines: TextLine[] = [];
  elements: StaggerElement[] = [];
  trailingSplit: ParsedTextSplit | null = null;

  canvas?: HTMLCanvasElement;
  canvasContext?: PaintRenderingContext2D | null;
  canvasWidth = 0;
  #scannedDimensions?: { width: number; height: number };

  text = this;

  readonly className: string;

  scanRects() {
    const rect = this.container.getBoundingClientRect();

    this.canvasWidth = rect.width;

    const styles = getComputedStyle(this.container);

    const rectWithoutPadding = new DOMRect(
      rect.left,
      rect.top,
      rect.width -
        parseFloat(styles.paddingLeft) -
        parseFloat(styles.paddingRight),
      rect.height -
        parseFloat(styles.paddingTop) -
        parseFloat(styles.paddingBottom)
    );

    return [[rectWithoutPadding]];
  }

  scanBoxes() {
    return this.boxes;
  }

  override get boxes() {
    return this.elements.flatMap((element) => element.boxes);
  }

  get progress(): number {
    if (!this.boxes.length) {
      return 1;
    }

    return (
      this.boxes.reduce((acc, box) => acc + box.progress, 0) / this.boxes.length
    );
  }

  set progress(progress: number) {
    if (!this.elements.length) {
      return;
    }

    const boxCount = this.elements.length;
    const progressPerElement = 1 / boxCount;

    this.elements.forEach((element, i) => {
      const startProgress = i * progressPerElement;

      element.progress = Math.min(
        1,
        Math.max(0, (progress - startProgress) / progressPerElement)
      );
    });
  }

  #resizeObserver?: ResizeObserver;
  #mutationObserver?: MutationObserver;
  #ignoreNextMutation = false;

  get container(): HTMLElement & { text?: Text } {
    return super.container;
  }

  set container(container: (HTMLElement & { text?: Text }) | undefined) {
    if (container === super.container) {
      return;
    }

    if (!container) {
      this.container.classList.remove("ai-flow", this.className);
      this.container.removeAttribute("data-progress");
      this.container.removeAttribute("data-lines");
      this.container.removeAttribute("data-elements");

      delete this.container.text;

      this.canvas?.remove();

      this.#mutationObserver?.disconnect();
      this.#resizeObserver?.disconnect();

      return;
    }

    this.container &&= undefined;

    super.container = container;

    container.classList.add("ai-flow", this.className);
    container.text = this;

    this.canvas = undefined;

    if (this.visualDebug) {
      this.canvas = document.createElement("canvas");
      this.canvas.style.position = "absolute";
      this.canvas.style.pointerEvents = "none";
      this.canvas.style.top = "0";
      this.canvas.style.left = "0";

      container.prepend(this.canvas);

      updateProperty(this.className, "mask-image", null);
      updateProperty(this.className, "position", "relative");
    } else if (maskRenderMode === CanvasMaskRenderMode.DataUri) {
      this.canvas = document.createElement("canvas");
      updateProperty(this.className, "will-change", "mask-image");
    } else if (maskRenderMode === CanvasMaskRenderMode.MozElement) {
      this.canvas = document.createElement("canvas");
      this.canvas.style.display = "none";
      this.canvas.id = this.className;
      document.head.prepend(this.canvas);

      updateProperty(
        this.className,
        "mask-image",
        `-moz-element(#${this.className})`
      );
    } else if (maskRenderMode === CanvasMaskRenderMode.WebkitCanvas) {
      updateProperty(
        this.className,
        "mask-image",
        `-webkit-canvas(${this.className})`
      );
    }

    this.canvasContext = this.canvas?.getContext("2d", {
      willReadFrequently: !this.visualDebug,
      alpha: true,
    });

    let mounted = false;

    this.#resizeObserver = new ResizeObserver((entries) => {
      if (!mounted) {
        this.scanElementLines({ reason: ScanReason.Mounted });
      } else {
        this.scanElementLines({ reason: ScanReason.Resize, entries });
      }

      this.paint();

      mounted = true;
    });

    let mutations: MutationRecord[] = [];
    let mutationScanner: number | undefined;

    this.#mutationObserver = new MutationObserver((entries) => {
      if (this.#ignoreNextMutation) {
        this.#ignoreNextMutation = false;
        return;
      }

      entries = entries.filter((entry) => entry.target !== this.canvas);

      mutations.push(...entries);

      if (!mutations.length) {
        return;
      }

      if (mutationScanner) {
        cancelAnimationFrame(mutationScanner);
      }

      mutationScanner = requestAnimationFrame(() => {
        this.scanElementLines({
          reason: ScanReason.Mutation,
          entries: mutations,
        });

        mutations = [];

        this.paint();
      });
    });

    this.#resizeObserver.observe(container);

    this.#mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
  }

  revealTrailing() {
    if (!this.trailingSplit) {
      return;
    }

    const trimChildNodes = this.createChildNodeTrimmer();

    new StaggerElement(
      this,
      trimChildNodes(this.trailingSplit.start, this.trailingSplit.end),
      this.trailingSplit
    );

    this.trailingSplit = null;
  }

  constructor(
    stagger: Stagger,
    public id: number,
    element: HTMLElement,
    public options: ParsedTextOptions
  ) {
    super(stagger, options, undefined!);

    this.className = this.options.classNamePrefix + "-" + id;

    this.container = element;

    updateProperty(this.className, "display", "block");
    updateProperty(this.className, "padding", "0 50%");
    updateProperty(this.className, "margin", "0 -50%");

    // hide until first render, but don't set to zero otherwise it
    // won't be scanned by the layout engine
    updateProperty(this.className, "opacity", "0.001");
  }

  get visualDebug() {
    return this.options.visualDebug;
  }

  get streaming() {
    return this.stagger.streaming ?? false;
  }

  get isLast() {
    const lastTextWithElements = this.stagger.texts.findLast(
      (text) => text.elements.length
    );

    return lastTextWithElements === this;
  }

  dispose() {
    this.container = undefined;
  }

  paint() {
    if (
      !this.visualDebug &&
      maskRenderMode === CanvasMaskRenderMode.PaintWorklet
    ) {
      updateProperty(
        this.className,
        "mask-image",
        `paint(text-stagger, ${JSON.stringify(JSON.stringify(this))})`
      );
    }

    if (this.canvasContext) {
      doPaint(this.canvasContext, this);
    }

    if (
      this.canvas &&
      !this.visualDebug &&
      maskRenderMode === CanvasMaskRenderMode.DataUri
    ) {
      updateProperty(
        this.className,
        "mask-image",
        `url(${this.canvas.toDataURL("image/png", 0)})`
      );
    }

    updateProperty(this.className, "opacity", null);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      canvasWidth: this.canvasWidth,
      elements: this.elements as SerializedStaggerElement[],
      visualDebug: this.visualDebug,
      streaming: this.streaming,
      isLast: this.isLast,
    };
  }

  diffElements(
    event: ScanEvent = { reason: ScanReason.Force },
    resized?: boolean
  ) {
    const trimChildNodes = this.createChildNodeTrimmer();

    const oldElements = this.elements;
    const newSplitElements = this.options.splitText(this, event);

    this.elements = [];

    const diffs = [
      ...calcSlices(
        oldElements as (StaggerElement | ParsedTextSplit)[],
        newSplitElements as (StaggerElement | ParsedTextSplit)[],
        (elementIndex, splitIndex) => {
          if (elementIndex === -1 || splitIndex === -1) {
            return false;
          }

          const element = oldElements[elementIndex];
          const textSplit = newSplitElements[splitIndex];

          const oldText = element.innerText.trim();
          const currentText = textSplit.text.trim();

          const startsWithPrevious = currentText.startsWith(oldText);
          const oldStartsWithCurrent = oldText.startsWith(currentText);
          const notExactMatch = textSplit.text !== element.innerText;

          if (!startsWithPrevious && !oldStartsWithCurrent) {
            return false;
          }

          if (
            notExactMatch ||
            (event.reason === ScanReason.Force && event.reset) ||
            element.childNodes.join("") !== element.innerText
          ) {
            if (
              (startsWithPrevious || oldStartsWithCurrent) &&
              element.progress
            ) {
              let newNodes: RangesChildNode[] = [];
              let currentStart = textSplit.start;
              let remainingLength = textSplit.end - textSplit.start;

              // Process each box until we run out of length
              for (const text of element.childText) {
                if (remainingLength <= 0) break;

                // For the last segment, might need to trim to remainingLength
                const length = Math.min(text.length, remainingLength);
                const boxNodes = trimChildNodes(
                  currentStart,
                  currentStart + length
                );
                newNodes.push(...boxNodes);

                currentStart += length;
                remainingLength -= length;
              }

              // For startsWithPrevious, add the extra content at the end
              if (startsWithPrevious) {
                newNodes.push(
                  ...trimChildNodes(
                    textSplit.start + oldText.length,
                    textSplit.end
                  )
                );
              }

              element.childNodes = newNodes;
            } else {
              const childNodes = trimChildNodes(textSplit.start, textSplit.end);
              element.childNodes = childNodes;
            }
          }

          return true;
        }
      ),
    ];

    // console.group("diff");

    diffs.forEach(([action, items], i) => {
      const isLastDiff = i === diffs.length - 1;

      if (action === 0) {
        for (const element of items as StaggerElement[]) {
          if (resized) {
            element.rescan();
          }

          this.elements.push(element);
        }

        return;
      }

      if (action === -1) {
        for (const element of items as StaggerElement[]) {
          console.error("remove", [element.innerText]);
        }
        return;
      }

      const splits = items as ParsedTextSplit[];

      console.warn(
        "add",
        Date.now(),
        splits.map((split) => split.text)
      );

      for (const text of this.stagger.texts) {
        if (!text.trailingSplit || text === this) {
          continue;
        }

        text.revealTrailing();
      }

      splits.forEach((split, i) => {
        const isLastElement =
          this.isLast && isLastDiff && i === splits.length - 1;

        if (
          isLastElement &&
          this.options.delayTrailing &&
          this.stagger.streaming === true
        ) {
          this.trailingSplit = split;
          return;
        }

        new StaggerElement(this, trimChildNodes(split.start, split.end), split);
      });
    });

    // console.groupEnd();
  }

  scanElementLines(event: ScanEvent = { reason: ScanReason.Force }) {
    if (event.reason === ScanReason.Mutation) {
      const impacts = this.analyzeMutationImpact(event.entries);

      if (impacts.requiresFullRescan) {
        this.lines = [];
      } else {
        this.lines = this.lines.slice(0, impacts.firstAffectedLine);
      }
    }

    const oldDimensions = this.#scannedDimensions;

    this.updateBounds();

    this.#scannedDimensions = {
      width: this.width,
      height: this.height,
    };

    const resized =
      !oldDimensions ||
      oldDimensions.width !== this.width ||
      oldDimensions.height !== this.height;

    if (resized) {
      if (this.canvas) {
        this.canvas.width = this.canvasWidth;
        this.canvas.height = this.height;

        this.lines = [];
      }

      if (
        !this.visualDebug &&
        maskRenderMode === CanvasMaskRenderMode.WebkitCanvas
      ) {
        this.canvasContext = document.getCSSCanvasContext?.(
          "2d",
          this.className,
          this.width,
          this.height
        );
      }
    }

    this.lines = TextLine.scanLines(this);
    this.childNodes = this.lines.flatMap((line) => line.childNodes);

    this.diffElements(event, resized);

    this.setAttribute("data-lines", this.lines.length);
    this.setAttribute("data-elements", this.elements.length);

    this.stagger.requestAnimation([this]);
  }

  setAttribute(name: string, value: string | number) {
    value = String(value);

    if (value === this.container.getAttribute(name)) {
      return;
    }

    this.#ignoreNextMutation = true;
    this.container.setAttribute(name, value);
  }

  #pixelCache = new Map<string, number>();

  convertToPx(
    cssLiteral: string | number,
    { height, width }: { height: number; width: number }
  ) {
    if (typeof cssLiteral === "number") {
      return cssLiteral;
    }

    const key = `${height}:${width}:${cssLiteral}`;

    if (!this.#pixelCache.has(key)) {
      const container = document.createElement("div");
      container.style.height = `${height}px`;
      container.style.width = `${width}px`;

      const target = document.createElement("div");
      target.style.width = cssLiteral;
      container.appendChild(target);
      this.container.appendChild(container);

      this.#pixelCache.set(key, target.offsetWidth);

      container.remove();
    }

    return this.#pixelCache.get(key)!;
  }

  private analyzeMutationImpact(
    mutations: MutationRecord[]
  ):
    | { requiresFullRescan: true; firstAffectedLine?: undefined }
    | { requiresFullRescan: false; firstAffectedLine: number } {
    let firstAffectedLine = null;

    for (const mutation of mutations) {
      switch (mutation.type) {
        // Text content changed
        case "characterData": {
          if (mutation.target instanceof Text) {
            const lineIndex = this.findLineContainingNode(mutation.target);

            if (lineIndex === -1) {
              return { requiresFullRescan: true };
            }

            firstAffectedLine = Math.min(
              firstAffectedLine ?? lineIndex,
              lineIndex
            );
          }

          break;
        }

        // Nodes added or removed
        case "childList": {
          for (const node of mutation.addedNodes) {
            const lineIndex = this.findLineContainingNode(
              node.previousSibling ?? node.parentElement ?? document.body
            );

            if (lineIndex === -1) {
              return { requiresFullRescan: true };
            }

            firstAffectedLine = Math.min(
              firstAffectedLine ?? lineIndex,
              lineIndex
            );
          }

          break;
        }

        // Style changes that might affect layout
        case "attributes": {
          const element = mutation.target as HTMLElement;

          if (this.doesAttributeAffectLayout(mutation.attributeName!)) {
            const lineIndex = this.findLineContainingNode(element);

            if (lineIndex === -1) {
              return { requiresFullRescan: true };
            }

            firstAffectedLine = Math.min(
              firstAffectedLine ?? lineIndex,
              lineIndex
            );
          }

          break;
        }
      }
    }

    if (firstAffectedLine == null) {
      return { requiresFullRescan: true };
    }

    return { requiresFullRescan: false, firstAffectedLine };
  }

  private findLineContainingNode(node: Node): number {
    // First check cache
    const cachedIndex = this.#mutationCache.get(node);
    if (cachedIndex != null) {
      return cachedIndex;
    }

    const index = this.lines.findIndex((line) =>
      line.ranges.some((range) => range.intersectsNode(node))
    );

    this.#mutationCache.set(node, index);

    return index;
  }

  private doesAttributeAffectLayout(attributeName: string): boolean {
    return LAYOUT_AFFECTING_ATTRIBUTES.has(attributeName.toLowerCase());
  }
}

export type SerializedText = ReturnType<Text["toJSON"]>;
