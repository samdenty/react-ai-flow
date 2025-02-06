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
} from "./canvas/index.js";
import { updateProperty } from "./styles/index.js";

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
  maxFps: number | null | ((text: Text) => boolean | number | null);
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
   * Lock the animation to a maximum FPS.
   *
   * @default null for no limit
   */
  maxFps?: number | null | ((text: Text) => boolean | number | null);

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

export class Text extends Ranges<StaggerElementBox, Stagger | Text> {
  #mutationCache = new WeakMap<Node, number>();
  #ignoredNodes = new WeakSet<Node>();
  #maxFps?: number;

  lines: TextLine[] = [];
  elements: StaggerElement[] = [];
  trailingSplit: ParsedTextSplit | null = null;

  canvas?: HTMLCanvasElement;
  canvasContext?: PaintRenderingContext2D | null;
  canvasRect = new DOMRect();
  #scannedDimensions?: {
    width: number;
    height: number;
    canvasWidth: number;
    canvasHeight: number;
  };
  customAnimationClassName: string;
  customAnimationContainer: HTMLElement;
  lastPaint?: number;

  text = this;

  readonly className: string;

  createIgnoredElement(element: HTMLElement): void;
  createIgnoredElement<K extends keyof HTMLElementTagNameMap>(
    element: K
  ): HTMLElementTagNameMap[K];
  createIgnoredElement(element: HTMLElement | keyof HTMLElementTagNameMap) {
    if (typeof element === "string") {
      element = document.createElement(element);
    }

    this.#ignoredNodes.add(element);

    return element;
  }

  get root(): Text {
    if (this.parent instanceof Text) {
      return this.parent.root;
    }

    return this;
  }

  scanRects() {
    let rect = this.container.getBoundingClientRect();
    const styles = getComputedStyle(this.container);

    let { left, right } = getAvailableSpace(this.container, rect);

    const paddingLeft = parseFloat(styles.paddingLeft) || 0;
    const paddingRight = parseFloat(styles.paddingRight) || 0;

    left += paddingLeft;
    right += paddingRight;

    if (paddingLeft !== left || paddingRight !== right) {
      updateProperty(this.className, "padding", `0px ${right}px 0 ${left}px`);
      updateProperty(this.className, "margin", `0px ${-right}px 0 ${-left}px`);

      rect = this.container.getBoundingClientRect();
    }

    const rectWithoutPadding = new DOMRect(
      rect.left + left,
      rect.top,
      rect.width - (left + right),
      rect.height
    );

    updateProperty(
      this.customAnimationClassName,
      "height",
      `${rectWithoutPadding.height}px`
    );

    updateProperty(
      this.customAnimationClassName,
      "width",
      `${rectWithoutPadding.width}px`
    );

    this.canvasRect = rect;

    return [[rectWithoutPadding]];
  }

  updateBounds(rects?: DOMRect[][]) {
    super.updateBounds(rects);

    this.updateCustomAnimationPosition();
  }

  insertCustomAnimationContainer() {
    if (this.text.customAnimationContainer.parentElement) {
      return;
    }

    this.text.container.insertAdjacentElement(
      "afterend",
      this.text.customAnimationContainer
    );

    this.updateCustomAnimationPosition(true);
  }

  get shouldSkipFrame() {
    const now = Date.now();
    const ms = 1000 / this.maxFps;

    return (
      this.stagger.lastPaint &&
      this.lastPaint &&
      (now - this.stagger.lastPaint < ms || now - this.lastPaint < ms)
    );
  }

  get maxFps() {
    if (this.#maxFps != null) {
      return this.#maxFps;
    }

    requestAnimationFrame(() => {
      this.#maxFps = undefined;
    });

    const maxFps = this.options.maxFps ?? Infinity;

    if (typeof maxFps === "number") {
      return (this.#maxFps = maxFps);
    }

    const result = maxFps(this);

    if (typeof result === "number") {
      return (this.#maxFps = result);
    }

    if (result === false) {
      return (this.#maxFps = 0);
    }

    return (this.#maxFps = Infinity);
  }

  private updateCustomAnimationPosition(force?: boolean) {
    if (!force && !this.customAnimationContainer.childNodes.length) {
      return;
    }

    let { top, left } = this.customAnimationContainer.getBoundingClientRect();

    if (top === this.top && left === this.left) {
      return;
    }

    const offsetTop = top - this.top;
    const offsetLeft = left - this.left;

    updateProperty(
      this.customAnimationClassName,
      "margin",
      `${-offsetTop}px 0px 0px ${-offsetLeft}px`
    );
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
      this.canvas?.remove();
      this.customAnimationContainer.remove();
      delete this.container.text;

      this.#mutationObserver?.disconnect();
      this.#resizeObserver?.disconnect();

      return;
    }

    this.container &&= undefined;

    super.container = container;

    this.container.text = this;
    this.container.classList.add("ai-flow", this.className);

    updateProperty(this.customAnimationClassName, "position", "absolute");

    if (!this.visualDebug) {
      updateProperty(this.customAnimationClassName, "pointer-events", "none");
    }

    this.canvas = undefined;

    updateProperty(this.className, "position", "relative");

    if (this.visualDebug) {
      this.canvas = this.createIgnoredElement("canvas");
      this.canvas.style.position = "absolute";
      this.canvas.style.pointerEvents = "none";
      this.canvas.style.top = "0";
      this.canvas.style.left = "50%";
      this.canvas.style.transform = "translateX(-50%)";

      this.container.prepend(this.canvas);

      updateProperty(this.className, "mask-image", null);
    } else if (maskRenderMode === CanvasMaskRenderMode.DataUri) {
      this.canvas = this.createIgnoredElement("canvas");
      updateProperty(this.className, "will-change", "mask-image");
    } else if (maskRenderMode === CanvasMaskRenderMode.MozElement) {
      this.canvas = this.createIgnoredElement("canvas");
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

      mounted = true;
    });

    let mutations: MutationRecord[] = [];
    let mutationScanner: number | undefined;

    this.#mutationObserver = new MutationObserver((entries) => {
      if (this.#ignoreNextMutation) {
        this.#ignoreNextMutation = false;
        return;
      }

      const mutated = mutations.some((mutation) => {
        let currentElement: Node | null = mutation.target;

        while (currentElement) {
          if (this.#ignoredNodes.has(currentElement)) {
            return false;
          }

          currentElement = currentElement.parentElement;
        }

        if (!mutation.addedNodes.length) {
          return true;
        }

        return [...mutation.addedNodes].some(
          (node) => !this.#ignoredNodes.has(node)
        );
      });

      if (!mutated) {
        return;
      }

      mutations.push(...entries);

      mutationScanner ??= requestAnimationFrame(() => {
        this.scanElementLines({
          reason: ScanReason.Mutation,
          entries: mutations,
        });

        mutations = [];
        mutationScanner = undefined;
      });
    });

    this.#resizeObserver.observe(this.container);

    this.#mutationObserver.observe(this.container, {
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

    const childNodes = trimChildNodes(
      this.trailingSplit.start,
      this.trailingSplit.end
    );

    // childNodes can be empty if a mutation has occurred in meantime
    if (childNodes.length) {
      new StaggerElement(this, childNodes, this.trailingSplit);
    }

    this.trailingSplit = null;
  }

  constructor(
    parent: Stagger | Text,
    public id: number,
    element: HTMLElement,
    public options: ParsedTextOptions
  ) {
    super(parent, options, undefined!);

    this.className = `${this.options.classNamePrefix}-${id}`;

    this.customAnimationClassName = `${this.options.classNamePrefix}-custom-${this.id}`;
    this.customAnimationContainer = this.createIgnoredElement("div");
    this.customAnimationContainer.className = this.customAnimationClassName;

    this.container = element;

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

  dispose() {
    this.container = undefined;
    updateProperty(this.className, null);
    updateProperty(this.customAnimationClassName, null);
  }

  paint() {
    this.lastPaint = Date.now();
    this.stagger.lastPaint = this.lastPaint;

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

  get subtext() {
    return this.stagger.texts.filter((text) => text.parent === this);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      canvasRect: {
        width: this.canvasRect.width,
        height: this.canvasRect.height,
      },
      subtext: this.subtext,
      elements: this.elements as SerializedStaggerElement[],
      visualDebug: this.visualDebug,
      streaming: this.streaming,
    };
  }

  diffElements(
    event: ScanEvent = { reason: ScanReason.Force },
    resized?: boolean
  ) {
    const trimChildNodes = this.createChildNodeTrimmer();
    const forceReset = event.reason === ScanReason.Force && event.reset;

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

          if (!forceReset && element.childNodes.join("") === textSplit.text) {
            return true;
          }

          const oldText = element.innerText.trim();
          const currentText = textSplit.text.trim();

          const startsWithPrevious = currentText.startsWith(oldText);
          const startsWithCurrent = oldText.startsWith(currentText);

          if (!startsWithPrevious && !startsWithCurrent) {
            return false;
          }

          if (!element.progress) {
            element.childNodes = trimChildNodes(textSplit.start, textSplit.end);
            return true;
          }

          let newNodes: RangesChildNode[] = [];
          let currentStart = textSplit.start;
          let remainingLength = textSplit.end - textSplit.start;

          for (const text of element.childText) {
            if (remainingLength <= 0) break;

            const length = Math.min(text.length, remainingLength);
            const boxNodes = trimChildNodes(
              currentStart,
              currentStart + length
            );
            newNodes.push(...boxNodes);

            currentStart += length;
            remainingLength -= length;
          }

          if (textSplit.text !== element.innerText && startsWithPrevious) {
            newNodes.push(
              ...trimChildNodes(textSplit.start + oldText.length, textSplit.end)
            );
          }

          element.childNodes = newNodes;

          return true;
        }
      ),
    ];

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
        return;
      }

      const splits = items as ParsedTextSplit[];

      for (const text of this.previousTexts) {
        text.revealTrailing();
      }

      splits.forEach((split, i) => {
        const isLastElement =
          this === (this.stagger.elements.at(-1)?.text ?? this) &&
          isLastDiff &&
          i === splits.length - 1;

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

      for (const text of this.nextTexts) {
        for (const element of text.elements) {
          element.restartAnimation();
        }
      }
    });
  }

  get previousTexts() {
    const index = this.stagger.texts.indexOf(this);
    return this.stagger.texts.slice(0, index);
  }

  get nextTexts() {
    const index = this.stagger.texts.indexOf(this);
    return this.stagger.texts.slice(index + 1);
  }

  scanElementLines(event: ScanEvent = { reason: ScanReason.Force }) {
    if (event.reason === ScanReason.Mutation) {
      const impacts = this.analyzeMutationImpact(event.entries);

      if (impacts.requiresFullRescan) {
        this.lines = [];
      } else {
        this.lines = this.lines.slice(0, impacts.firstAffectedLine);
        // todo handle subtext
      }
    }

    const oldDimensions = this.#scannedDimensions;

    this.updateBounds();

    this.#scannedDimensions = {
      width: this.width,
      height: this.height,
      canvasWidth: this.canvasRect.width,
      canvasHeight: this.canvasRect.height,
    };

    if (
      oldDimensions?.canvasWidth !== this.canvasRect.width ||
      oldDimensions.canvasHeight !== this.canvasRect.height
    ) {
      if (this.canvas) {
        this.canvas.width = this.canvasRect.width;
        this.canvas.height = this.canvasRect.height;
      }

      if (
        !this.visualDebug &&
        maskRenderMode === CanvasMaskRenderMode.WebkitCanvas
      ) {
        this.canvasContext = document.getCSSCanvasContext?.(
          "2d",
          this.className,
          this.canvasRect.width,
          this.canvasRect.height
        );
      }
    }

    const resized =
      oldDimensions?.width !== this.width ||
      oldDimensions.height !== this.height;

    if (resized || (event.reason === ScanReason.Force && event.reset)) {
      this.lines = [];

      for (const text of this.nextTexts) {
        text.updateBounds();
      }
    }

    updateProperty(
      this.className,
      "display",
      hasBlockElement(this.container, this.#ignoredNodes)
        ? "block"
        : "inline-block"
    );

    this.lines = TextLine.scanLines(this);
    this.childNodes = this.lines.flatMap((line) => line.childNodes);

    this.diffElements(event, resized);

    this.setAttribute("data-lines", `${this.lines.length}`);
    this.setAttribute("data-elements", `${this.elements.length}`);

    this.paint();

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
      const container = this.createIgnoredElement("div");
      container.style.height = `${height}px`;
      container.style.width = `${width}px`;

      const target = this.createIgnoredElement("div");
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

function getAvailableSpace(element: HTMLElement, elementRect: DOMRect) {
  // Initialize variables to store the nearest overflow container's bounds
  let overflowContainer: HTMLElement | null = null;
  let overflowContainerRect: {
    left: number;
    right: number;
    width: number;
  } | null = null;

  // Start from the parent and traverse up the DOM tree
  let currentElement = element.parentElement;

  while (currentElement && currentElement !== document.body) {
    const style = getComputedStyle(currentElement);
    const overflowX = style.overflowX;

    if (
      overflowX === "hidden" ||
      overflowX === "scroll" ||
      overflowX === "auto"
    ) {
      overflowContainer = currentElement;
      overflowContainerRect = currentElement.getBoundingClientRect();
      break;
    }

    currentElement = currentElement.parentElement;
  }

  // If no overflow container found, use viewport dimensions
  if (!overflowContainerRect) {
    overflowContainerRect = {
      left: 0,
      right: window.innerWidth,
      width: window.innerWidth,
    };
  }

  overflowContainer ||= document.body;

  const styles = getComputedStyle(overflowContainer);

  const paddingLeft = parseFloat(styles.paddingLeft) || 0;
  const paddingRight = parseFloat(styles.paddingRight) || 0;

  // Calculate available space
  const left = Math.max(
    0,
    elementRect.left - overflowContainerRect.left - paddingLeft
  );

  const right = Math.max(
    0,
    overflowContainerRect.right - elementRect.right - paddingRight
  );

  return {
    left,
    right,
    overflowContainer,
  };
}

function hasBlockElement(element: Element, ignored: WeakSet<Node>) {
  // Get computed style for direct children
  for (const child of element.children) {
    if (ignored.has(child)) continue;

    const display = window.getComputedStyle(child).display;

    // Check if current element is block
    if (
      display === "block" ||
      display === "flex" ||
      display === "grid" ||
      display === "list-item"
    ) {
      return true;
    }

    // Recursively check children
    if (hasBlockElement(child, ignored)) {
      return true;
    }
  }

  return false;
}
