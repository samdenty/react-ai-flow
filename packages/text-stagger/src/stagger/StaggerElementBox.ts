import {
  Box,
  preserveOptimizeRects,
  Ranges,
  TextLine,
  Text,
  type SplitterImpl,
} from "../text/index.js";
import { cloneRangeWithStyles } from "../text/styles/cloneRangeStyles.js";
import { getCustomAnimationStyles } from "../text/styles/customAnimationStyles.js";
import {
  ElementAnimation,
  ElementAnimationTiming,
  type ElementOptions,
  isGradient,
  StaggerElement,
  timingFunctions,
} from "./StaggerElement.js";

export interface StaggerElementBoxOptions
  extends SplitterImpl<ElementOptions> {}

let ID = 0;

export class StaggerElementBox extends Ranges<Box, StaggerElement> {
  static DEFAULT_GRADIENT_WIDTH = 100;

  #lines?: TextLine[];
  #progress = 0;

  id = ++ID;
  className: string;

  customAnimationElement?: HTMLElement;
  initialStyle?: string;

  start: number;
  end: number;

  #rect?: DOMRect;

  constructor(
    parent: StaggerElement,
    public options: StaggerElementBoxOptions,
    element: HTMLElement,
    ranges: Range[],
    position: { start: number; end: number },
    public subtext: Text | null,
    rect: DOMRect
  ) {
    super(parent, options, element);
    this.#rect = rect;
    this.childNodes = ranges;

    this.start = position.start;
    this.end = position.end;

    this.className = `${this.text.options.classNamePrefix}-box-${this.id}`;
  }

  dispose() {
    super.dispose();

    this.customAnimationElement?.remove();

    const { closestCommonParent } = this.subtext || {};

    if (closestCommonParent && this.initialStyle != null) {
      closestCommonParent.element.setAttribute("style", this.initialStyle);
    }
  }

  scanRanges() {
    const rect = this.#rect;

    if (rect) {
      this.#rect = undefined;
      return [[rect]];
    }

    return super.scanRanges();
  }

  scanBounds(
    rects: { top: number; left: number; bottom: number; right: number }[][]
  ) {
    if (this.subtext) {
      return Box.getBounds([this.subtext]);
    }

    return super.scanBounds(rects);
  }

  scanBoxes(rects: DOMRect[][]) {
    return preserveOptimizeRects(rects, (rect) => {
      const { top, left } = Box.calculateRelative(rect, this);

      return new Box(
        this,
        this.options,
        this.container,
        top,
        left,
        rect.width,
        rect.height
      );
    });
  }

  get element() {
    return this.parent;
  }

  get progress() {
    return this.#progress;
  }

  timingFunction(progress: number) {
    const animationTiming =
      this.options.animationTiming ??
      (this.element.animation === ElementAnimation.FadeIn
        ? ElementAnimationTiming.Linear
        : ElementAnimationTiming.EaseInOut);

    const resolvedTiming =
      typeof animationTiming === "function"
        ? animationTiming(this)
        : animationTiming;

    const timing =
      typeof resolvedTiming === "number"
        ? resolvedTiming
        : timingFunctions[resolvedTiming](progress);

    return timing;
  }

  get timing() {
    return this.timingFunction(this.progress);
  }

  set progress(progress: number) {
    // if someone accidentally passes NaN
    progress ||= 0;

    const changed = progress !== this.progress;

    if (!changed) {
      return;
    }

    this.#progress = progress;

    this.text.setAttribute(
      "data-progress",
      `${Math.round(this.text.progress * 100)}`
    );

    this.updateCustomAnimation();
  }

  updateCustomAnimation() {
    const styles = getCustomAnimationStyles(this);

    const { closestCommonParent } = this.subtext || {};

    if (closestCommonParent) {
      this.initialStyle ??=
        closestCommonParent.element.getAttribute("style") || "";

      closestCommonParent.element.setAttribute("style", this.initialStyle);

      console.log(
        closestCommonParent.element.className,
        styles,
        this.initialStyle
      );
      if (!styles) {
        return;
      }

      for (const [key, value] of Object.entries(styles)) {
        if (value != null) {
          closestCommonParent.element.style.setProperty(key, value);
        }
      }

      return;
    }

    if (!styles) {
      this.customAnimationElement?.remove();
      this.customAnimationElement = undefined;

      if (!this.text.customAnimationContainer.childNodes.length) {
        this.text.customAnimationContainer.remove();
      }

      return;
    }

    if (!this.customAnimationElement) {
      this.customAnimationElement = this.text.createIgnoredElement("div");
      this.customAnimationElement.className = this.className;

      this.text.insertCustomAnimationContainer();
      this.text.customAnimationContainer.append(this.customAnimationElement);

      for (const range of this.ranges) {
        cloneRangeWithStyles(range, this.customAnimationElement, (element) => {
          if (!this.text.options.visualDebug) {
            element.style.pointerEvents = "none";
          }
        });
      }

      if (this.customAnimationElement.style.display === "list-item") {
        this.customAnimationElement.style.display = "";
      }

      this.initialStyle = undefined;
    }

    this.initialStyle ??=
      this.customAnimationElement.getAttribute("style") || "";

    this.customAnimationElement.setAttribute("style", this.initialStyle);

    this.customAnimationElement.style.boxSizing = "content-box";
    this.customAnimationElement.style.lineHeight = `${this.height}px`;
    this.customAnimationElement.style.height = `${this.height}px`;
    this.customAnimationElement.style.width = `${this.width}px`;

    if (this.text.options.visualDebug) {
      this.customAnimationElement.style.padding = "0";
      this.customAnimationElement.style.margin = "0";
    } else {
      this.customAnimationElement.style.padding = `${this.height}px ${this.width}px`;
      this.customAnimationElement.style.margin = `-${this.height}px -${this.width}px`;
    }

    for (const [key, value] of Object.entries(styles)) {
      (this.customAnimationElement.style as any)[key] = value;
    }

    if (this.text.options.visualDebug) {
      this.customAnimationElement.style.background = "rgba(0, 255, 0, 0.6)";
    }

    this.customAnimationElement.style.position = "absolute";
    this.customAnimationElement.style.top = `${this.top - this.text.top}px`;
    this.customAnimationElement.style.left = `${this.left - this.text.left}px`;
  }

  get text() {
    return this.element.text;
  }

  get lines() {
    if (this.#lines) {
      return this.#lines;
    }

    return (this.#lines = TextLine.getLines(this.text, this));
  }

  get isLast() {
    return this.element.uniqueBoxes.at(-1) === this;
  }

  get isGradient() {
    return isGradient(this.options.animation);
  }

  comparePosition(other: this) {
    if (this.text !== other.text) {
      return super.comparePosition(other);
    }

    const pos = this.element.comparePosition(other.element);

    if (pos) {
      return pos;
    }

    return super.comparePosition(other);
  }

  get gradientWidth() {
    let cssLiteral = this.options.gradientWidth;

    if (
      !this.isGradient ||
      cssLiteral == null ||
      this.timing === 0 ||
      this.timing === 1
    ) {
      return StaggerElementBox.DEFAULT_GRADIENT_WIDTH;
    }

    if (typeof cssLiteral === "function") {
      cssLiteral = cssLiteral(this);

      if (cssLiteral == null) {
        return StaggerElementBox.DEFAULT_GRADIENT_WIDTH;
      }
    }

    return this.text.convertToPx(cssLiteral, this);
  }

  get relativeToText() {
    return this.relativeTo(this.text);
  }

  get relativeToCanvas() {
    const { left, top, right, bottom, width, height } = this.relativeToText;
    const marginLeft = this.text.left - this.text.canvasRect.left;

    return {
      left: left + marginLeft,
      right: right + marginLeft,
      top,
      bottom,
      width,
      height,
    };
  }

  toJSON() {
    return {
      relativeToCanvas: this.relativeToCanvas,
      progress: this.progress,
      timing: this.timing,
      gradientWidth: this.gradientWidth,
      subtext: this.subtext,
      text: {
        parentText: this.text.parentText && {
          id: this.text.parentText.id,
        },
      },
      isLast: this.isLast,
    };
  }
}

export type SerializedStaggerElementBox = ReturnType<
  StaggerElementBox["toJSON"]
>;
