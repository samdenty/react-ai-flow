import {
  optimizeRects,
  type ParsedTextOptions,
  type ParsedTextSplit,
  Ranges,
  type RangesChildNode,
  Text,
} from "../text/index.js";
import { mergeObject } from "../utils/mergeObject.js";
import {
  type SerializedStaggerElementBox,
  StaggerElementBox,
} from "./StaggerElementBox.js";

export enum ElementAnimation {
  FadeIn = "fade-in",

  GradientReveal = "gradient-reveal",
  GradientLeft = "gradient-left",
  GradientUp = "gradient-up",
  GradientDown = "gradient-down",

  // Custom style-powered animations
  Custom = "custom",
  BlurIn = "blur-in",
  BounceIn = "bounce-in",
}

export type GradientAnimation =
  | ElementAnimation.GradientReveal
  | ElementAnimation.GradientLeft
  | ElementAnimation.GradientUp
  | ElementAnimation.GradientDown;

export enum ElementAnimationTiming {
  Linear = "linear",
  Ease = "ease",
  EaseIn = "ease-in",
  EaseOut = "ease-out",
  EaseInOut = "ease-in-out",
}

export type MaskAnimation = GradientAnimation | ElementAnimation.FadeIn;

export interface CustomStyles
  extends Partial<Record<keyof CSSStyleDeclaration, string>> {}

export type RelativeTimePeriod = number | `${number}%`;

export interface ElementOptions {
  animation?: ElementAnimation | `${ElementAnimation}`;

  animationTiming?:
    | ElementAnimationTiming
    | `${ElementAnimationTiming}`
    | ((
        box: StaggerElementBox
      ) => number | ElementAnimationTiming | `${ElementAnimationTiming}`);

  customStyles?: (box: StaggerElementBox) => CustomStyles | null | undefined;

  blurAmount?: string | number | ((box: StaggerElementBox) => string | number);

  gradientWidth?:
    | string
    | number
    | ((box: StaggerElementBox) => string | number | undefined);

  /**
   * @example
   * For 1 second:
   * duration: (element) => element.width / element.text.root.width * 1000
   */
  duration?: number | ((element: StaggerElement) => number);

  /**
   * @example
   * For half the duration of the animation:
   * stagger: '50%'
   */
  stagger?:
    | RelativeTimePeriod
    | ((
        element: StaggerElement,
        previousElement: StaggerElement | null
      ) => RelativeTimePeriod);

  vibration?:
    | RelativeTimePeriod
    | RelativeTimePeriod[]
    | false
    | ((
        element: StaggerElement
      ) => RelativeTimePeriod | RelativeTimePeriod[] | false);

  delay?: (element: StaggerElement) => number;
}

let ID = 0;

export type AnimationDuration = number | CustomAnimationDuration;
export type CustomAnimationDuration = (element: StaggerElement) => number;

export class StaggerElement extends Ranges<StaggerElementBox, Text> {
  id = ++ID;

  startTime!: number;
  duration!: number;
  vibration!: number[] | null;
  #delay: number | null = null;
  staggerDelay: number | null = null;

  batchId!: number;
  index!: number;

  override options: ElementOptions & ParsedTextOptions;

  start: number;
  end: number;
  subtext: Text | null = null;

  constructor(
    public text: Text,
    childNodes: RangesChildNode[],
    split: ParsedTextSplit
  ) {
    const parsedOptions = mergeObject(text.options, split);
    super(text, parsedOptions, text.container);
    this.options = parsedOptions;

    this.start = split.start;
    this.end = split.end;

    this.subtext =
      this.text.continuousChildNodesOffsets.find(({ nodes }) => {
        return nodes.some(({ start, end }) => {
          return start >= this.start && end <= this.end;
        });
      })?.subtext ?? null;

    this.childNodes = childNodes;
    text.elements.push(this);
  }

  restartAnimation() {
    const now = Date.now();

    this.progress = 0;
    this.batchId = this.stagger.batchId;

    const previousElements = this.previousElements;

    const latestElementInBatch = previousElements.findLast(
      (el) => el.batchId === this.batchId
    );

    const lastActiveElement = previousElements.findLast((element) => {
      const elapsedTime = now - element.startTime - element.delay;
      return elapsedTime < element.duration;
    });

    if (latestElementInBatch) {
      this.index = latestElementInBatch.index + 1;
      this.startTime = latestElementInBatch.startTime;
      this.batchId = latestElementInBatch.batchId;
    } else {
      this.startTime = now;
      this.index = lastActiveElement ? 1 : 0;
    }

    this.duration = this.calculateDuration();
    this.vibration = this.calculateVibration();

    if (typeof this.options.delay === "number") {
      this.#delay = this.options.delay;
    }

    const previousElement = latestElementInBatch ?? lastActiveElement ?? null;

    if (typeof this.options.stagger === "number") {
      this.staggerDelay = this.options.stagger;
    } else if (typeof this.options.stagger === "string") {
      const percent = parseFloat(this.options.stagger) ?? 0;
      this.staggerDelay = (percent / 100) * (previousElement?.duration ?? 0);
    } else {
      const staggerDelay = this.options.stagger(this, previousElement);

      if (typeof staggerDelay === "number") {
        this.staggerDelay = staggerDelay;
      } else {
        const percent = parseFloat(staggerDelay) ?? 0;
        this.staggerDelay = (percent / 100) * (previousElement?.duration ?? 0);
      }
    }

    if (latestElementInBatch) {
      this.staggerDelay += latestElementInBatch.staggerDelay ?? 0;
    } else if (lastActiveElement) {
      const difference = now - lastActiveElement.startTime;

      this.staggerDelay += Math.max(
        0,
        (lastActiveElement.staggerDelay ?? 0) - difference
      );
    }

    if (typeof this.options.delay === "function") {
      this.#delay = this.options.delay(this);
    }
  }

  get previousElements() {
    const index = this.stagger.elements.indexOf(this);
    return this.stagger.elements.slice(0, index);
  }

  get nextElements() {
    const index = this.stagger.elements.indexOf(this);
    return this.stagger.elements.slice(index + 1);
  }

  private calculateVibration() {
    let vibration: RelativeTimePeriod | RelativeTimePeriod[];

    if (typeof this.options.vibration === "function") {
      vibration = this.options.vibration(this) || 0;
    } else {
      vibration = this.options.vibration || 0;
    }

    if (!vibration) {
      return null;
    }

    if (typeof vibration === "number" || typeof vibration === "string") {
      vibration = [vibration];
    }

    const relativeTo = this.duration - (this.staggerDelay ?? 0);

    const vibrationTimes = vibration.map((time) => {
      if (typeof time === "number") {
        return time;
      }

      const percent = parseFloat(time) || 0;

      return (relativeTo / 100) * percent;
    });

    const totalTime = vibrationTimes.reduce((a, b) => a + b, 0);

    if (totalTime <= 0) {
      return null;
    }

    return vibrationTimes;
  }

  private calculateDuration() {
    let duration: number | null = null;
    if (typeof this.options.duration === "number") {
      duration = this.options.duration;
    } else if (typeof this.options.duration === "function") {
      duration = this.options.duration(this);
    }

    return duration ?? (this.width / this.text.root.width) * 500;
  }

  get delay() {
    return (this.#delay ?? 0) + (this.staggerDelay ?? 0);
  }

  scanBoxes(rects: DOMRect[][]) {
    const { closestCommonParent } = this.subtext || {};

    if (closestCommonParent) {
      const box = new StaggerElementBox(
        this,
        this.options,
        this.container,
        this.ranges,
        closestCommonParent.rect
      );

      return rects.map((rects) => rects.map((_) => box));
    }

    return optimizeRects(rects, (rect, indexes) => {
      return new StaggerElementBox(
        this,
        this.options,
        this.container,
        [...new Set(indexes.map(([i]) => this.ranges[i]))],
        rect
      );
    });
  }

  get lines() {
    const lines = new Set(this.boxes.map(([box]) => box.line));
    return [...lines].filter((line) => !!line);
  }

  get isLast() {
    return this.text.elements.at(-1) === this;
  }

  override rescan() {
    const oldBoxCount = this.uniqueBoxes.length;
    const oldProgresses = this.uniqueBoxes.map((box) => box.progress);

    super.rescan();

    const now = Date.now();

    if (oldBoxCount && this.uniqueBoxes.length !== oldBoxCount) {
      this.duration = this.calculateDuration();

      const progresses =
        this.uniqueBoxes.length > oldBoxCount
          ? oldProgresses
          : this.uniqueBoxes.map((_, i) => oldProgresses[i]);

      // Calculate total elapsed time from old progress values
      const totalElapsedTime = progresses.reduce(
        (current, progress) =>
          current + progress * (this.duration / this.uniqueBoxes.length),
        0
      );

      this.startTime = now - totalElapsedTime;
      this.staggerDelay = 0;
      this.batchId = this.stagger.batchId;
    }

    // Restore progress to existing boxes, new boxes start at 0
    this.uniqueBoxes.forEach((box, i) => {
      box.progress = i < oldBoxCount ? oldProgresses[i] : 0;
    });
  }

  get progress(): number {
    if (!this.uniqueBoxes.length) {
      return 1;
    }

    return (
      this.uniqueBoxes.reduce((acc, box) => acc + box.progress, 0) /
      this.uniqueBoxes.length
    );
  }

  set progress(progress: number) {
    if (!this.uniqueBoxes.length) {
      return;
    }

    const boxCount = this.uniqueBoxes.length;
    const progressPerBox = 1 / boxCount;

    this.uniqueBoxes.forEach((box, i) => {
      if (this.animation === ElementAnimation.FadeIn) {
        box.progress = progress;
        return;
      }

      const boxStartProgress = i * progressPerBox;
      let boxProgress = Math.min(
        1,
        Math.max(0, (progress - boxStartProgress) / progressPerBox)
      );

      box.progress = boxProgress;
    });
  }

  get animation() {
    return this.options.animation;
  }

  get relativeToText() {
    return this.relativeTo(this.text);
  }

  toJSON() {
    return {
      subtext: this.subtext,
      startTime: this.startTime,
      duration: this.duration,
      delay: this.delay,
      textContent: this.textContent,
      animation: this.animation,
      uniqueBoxes: this.uniqueBoxes as SerializedStaggerElementBox[],
      isLast: this.isLast,
    };
  }
}

export type SerializedStaggerElement = ReturnType<StaggerElement["toJSON"]>;

export function isGradient(
  animation: ElementAnimation | `${ElementAnimation}`
) {
  return (
    animation === ElementAnimation.GradientLeft ||
    animation === ElementAnimation.GradientReveal ||
    animation === ElementAnimation.GradientUp ||
    animation === ElementAnimation.GradientDown
  );
}

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
export const timingFunctions = {
  [ElementAnimationTiming.Linear]: linearTiming,
  [ElementAnimationTiming.Ease]: easeTiming,
  [ElementAnimationTiming.EaseIn]: easeInTiming,
  [ElementAnimationTiming.EaseOut]: easeOutTiming,
  [ElementAnimationTiming.EaseInOut]: easeInOutTiming,
};
