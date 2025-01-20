import { Box, Ranges, TextLine, type SplitterImpl } from "../text/index.js";
import { cloneRangeWithStyles } from "../text/styles/cloneRangeStyles.js";
import { getCustomAnimationStyles } from "../text/styles/customAnimationStyles.js";
import {
  ElementAnimation,
  ElementAnimationTiming,
  type ElementOptions,
  isGradient,
  StaggerElement,
} from "./StaggerElement.js";

export interface StaggerElementBoxOptions
  extends SplitterImpl<ElementOptions> {}

let ID = 0;

export class StaggerElementBox extends Ranges<Box, StaggerElement> {
  static DEFAULT_GRADIENT_WIDTH = 100;

  #line?: TextLine;
  #progress = 0;

  id = ++ID;
  className: string;

  customAnimationElement?: HTMLElement & { initialStyle?: string };

  constructor(
    parent: StaggerElement,
    public options: StaggerElementBoxOptions,
    element: HTMLElement,
    public range: Range,
    private rect: DOMRect
  ) {
    super(parent, options, element);
    this.childNodes = [range];

    this.className = `${this.text.options.classNamePrefix}-box-${this.id}`;
  }

  dispose() {
    super.dispose();

    this.customAnimationElement?.remove();
  }

  scanRects() {
    return [[this.rect]];
  }

  scanBoxes(rects: DOMRect[][]) {
    return rects.flat().map((rect) => {
      return new Box(
        this,
        this.options,
        this.container,
        rect.top - this.text.canvasRect.top,
        rect.left - this.text.canvasRect.left,
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

    this.text.stagger.requestAnimation([this.text]);
  }

  updateCustomAnimation() {
    const styles = getCustomAnimationStyles(this);

    if (!styles) {
      this.customAnimationElement?.remove();
      this.customAnimationElement = undefined;
      return;
    }

    if (!this.customAnimationElement) {
      this.customAnimationElement = document.createElement("div");
      this.customAnimationElement.className = this.className;

      this.text.customAnimationContainer?.append(this.customAnimationElement);

      cloneRangeWithStyles(this.range, this.customAnimationElement);

      this.customAnimationElement.style.pointerEvents = "none";

      this.customAnimationElement.initialStyle =
        this.customAnimationElement.getAttribute("style")!;
    }

    this.customAnimationElement.setAttribute(
      "style",
      this.customAnimationElement.initialStyle!
    );

    this.customAnimationElement.style.lineHeight = `${this.height}px`;
    this.customAnimationElement.style.height = `${this.height}px`;
    this.customAnimationElement.style.width = `${this.width}px`;
    this.customAnimationElement.style.margin = "0px";
    this.customAnimationElement.style.padding = "0px";

    for (const [key, value] of Object.entries(styles)) {
      (this.customAnimationElement.style as any)[key] = value;
    }

    if (this.text.options.visualDebug) {
      this.customAnimationElement.style.background = "rgba(0, 255, 0, 0.6)";
    }

    this.customAnimationElement.style.position = "absolute";

    this.customAnimationElement.style.top = `${
      this.top - (this.text.top - this.text.canvasRect.top)
    }px`;

    this.customAnimationElement.style.left = `${
      this.left - (this.text.left - this.text.canvasRect.left)
    }px`;
  }

  get text() {
    return this.element.text;
  }

  get line() {
    const TOLERANCE = 1;

    return (this.#line ??= this.text.lines.find((line) => {
      return (
        line.top <= this.top + TOLERANCE &&
        line.bottom >= this.bottom - TOLERANCE &&
        line.left <= this.left + TOLERANCE &&
        line.right >= this.right - TOLERANCE
      );
    }));
  }

  get isLast() {
    return this.element.boxes.at(-1) === this;
  }

  get isGradient() {
    return isGradient(this.options.animation);
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

  override toJSON() {
    return {
      ...super.toJSON(),
      progress: this.progress,
      timing: this.timing,
      gradientWidth: this.gradientWidth,
      isLast: this.isLast,
    };
  }
}

export type SerializedStaggerElementBox = ReturnType<
  StaggerElementBox["toJSON"]
>;

const linearTiming = (progress: number): number => {
  return progress;
};

const easeTiming = (progress: number): number => {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
};

const easeInTiming = (progress: number): number => {
  return progress * progress * progress;
};

const easeOutTiming = (progress: number): number => {
  return 1 - Math.pow(1 - progress, 3);
};

const easeInOutTiming = (progress: number): number => {
  return progress < 0.5
    ? 8 * progress * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 4) / 2;
};

// Usage with timing enum:
const timingFunctions = {
  [ElementAnimationTiming.Linear]: linearTiming,
  [ElementAnimationTiming.Ease]: easeTiming,
  [ElementAnimationTiming.EaseIn]: easeInTiming,
  [ElementAnimationTiming.EaseOut]: easeOutTiming,
  [ElementAnimationTiming.EaseInOut]: easeInOutTiming,
};
