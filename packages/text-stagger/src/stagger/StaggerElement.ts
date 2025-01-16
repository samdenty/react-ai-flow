import { Ranges, type RangesChildNode, Text } from "../text/index.js";
import { mergeObject } from "../utils/mergeObject.js";
import {
  type SerializedStaggerElementBox,
  StaggerElementBox,
} from "./StaggerElementBox.js";

export const enum ElementAnimation {
  FadeIn = "fade-in",

  GradientLeft = "gradient-left",
  GradientRight = "gradient-right",
  GradientUp = "gradient-up",
  GradientDown = "gradient-down",
}

export interface ElementOptions {
  animation?: ElementAnimation | `${ElementAnimation}`;
  gradientWidth?:
    | string
    | number
    | ((box: StaggerElementBox) => string | number | undefined);

  duration?: number | ((element: StaggerElement) => number);
  stagger?: number | ((element: StaggerElement) => number);
  delay?: (element: StaggerElement) => number;
}

let ID = 0;

export type AnimationDuration = number | CustomAnimationDuration;
export type CustomAnimationDuration = (element: StaggerElement) => number;

export class StaggerElement extends Ranges<StaggerElementBox, Text> {
  id = ++ID;

  startTime: number;
  duration = 0;
  delay = 0;
  private staggerDelay = 0;

  batchId: number;
  index: number;

  constructor(
    public text: Text,
    childNodes: RangesChildNode[],
    options?: ElementOptions
  ) {
    super(text, mergeObject(text.options, options), text.container);

    const currentTime = Date.now();
    this.startTime = currentTime;
    this.batchId = this.stagger.batchId;
    this.index = 1;

    // Find any currently animating elements
    const activeElements = this.stagger.elements.filter((element) => {
      const elapsedTime = currentTime - element.startTime - element.delay;
      return elapsedTime < element.duration;
    });

    // If there are active animations, sync with them
    if (activeElements.length > 0) {
      // Sort by end time to find the last one that will finish
      const sortedByEndTime = [...activeElements].sort((a, b) => {
        const aEndTime = a.startTime + a.delay + a.duration;
        const bEndTime = b.startTime + b.delay + b.duration;
        return aEndTime - bEndTime;
      });

      const lastElement = sortedByEndTime[sortedByEndTime.length - 1];
      const lastEndTime =
        lastElement.startTime + lastElement.delay + lastElement.duration;

      // If the last animation is still going
      if (lastEndTime > this.startTime) {
        this.startTime = lastElement.startTime;
        this.batchId = lastElement.batchId;
        this.index = lastElement.index + 1;

        const elapsedSinceStart = currentTime - this.startTime;
        const effectiveDelay = this.delay + this.staggerDelay;

        if (elapsedSinceStart > effectiveDelay) {
          const timeIntoAnimation = elapsedSinceStart - effectiveDelay;
          const initialProgress = Math.min(
            1,
            timeIntoAnimation / this.duration
          );
          this.progress = initialProgress;
        } else {
          // An animation is still playing and this is a new batch
          this.progress = 0;
        }
      }
    }

    this.childNodes = childNodes;
    text.elements.push(this);

    // Find last element in current batch for stagger accumulation
    const lastElementInCurrentBatch = this.stagger.elements.findLast(
      (el) => el.batchId === this.batchId && el.index < this.index
    );

    if (typeof this.options.duration === "number") {
      this.duration = this.options.duration;
    } else if (typeof this.options.duration === "function") {
      this.duration = this.options.duration(this);
    }

    if (typeof this.options.delay === "number") {
      this.delay = this.options.delay;
    } else if (typeof this.options.delay === "function") {
      this.delay = this.options.delay(this);
    }

    this.duration ||= 500;

    if (typeof this.options.stagger === "number") {
      this.staggerDelay = this.options.stagger;
    } else if (typeof this.options.stagger === "function") {
      this.staggerDelay = this.options.stagger(this);
    } else if (this.index && !this.delay && !this.staggerDelay) {
      this.staggerDelay = this.duration;
    }

    this.staggerDelay += lastElementInCurrentBatch?.staggerDelay ?? 0;
    this.delay += this.staggerDelay;
  }

  scanBoxes(rects: DOMRect[]) {
    return rects.map((rect) => {
      return new StaggerElementBox(
        this,
        this.options,
        this.container,
        rect.top - this.text.top,
        rect.left - this.text.left,
        rect.width,
        rect.height
      );
    });
  }

  get lines() {
    const lines = new Set(this.boxes.map((box) => box.line));
    return [...lines];
  }

  get progress(): number {
    if (!this.boxes.length) {
      return 1;
    }

    return (
      this.boxes.reduce((acc, box) => acc + box.progress, 0) / this.boxes.length
    );
  }

  get isLast() {
    return this.text.elements.at(-1) === this;
  }

  override rescan() {
    const widthProgress = this.progress * this.width;
    super.rescan();
    this.progress = widthProgress / this.width || 0;
  }

  set progress(progress: number) {
    if (!this.boxes.length) {
      return;
    }

    const boxCount = this.boxes.length;
    const progressPerBox = 1 / boxCount;

    this.boxes.forEach((box, i) => {
      if (this.animation === ElementAnimation.FadeIn) {
        box.progress = progress;
        return;
      }

      const boxStartProgress = i * progressPerBox;
      let boxProgress = Math.min(
        1,
        Math.max(0, (progress - boxStartProgress) / progressPerBox)
      );

      if (
        this.text.streaming &&
        box.isLast &&
        this.isLast &&
        this.text.isLast
      ) {
        const runwayWidth = Math.max(box.width, box.gradientWidth);
        const maxProgress = Math.min(
          1,
          Math.max(0.5, 1 - box.gradientWidth / runwayWidth)
        );
        boxProgress = Math.min(maxProgress, boxProgress);
      }

      box.progress = boxProgress;
    });
  }

  get animation() {
    return this.options.animation;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      startTime: this.startTime,
      duration: this.duration,
      delay: this.delay,
      textContent: this.textContent,
      animation: this.animation,
      boxes: this.boxes as SerializedStaggerElementBox[],
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
    animation === ElementAnimation.GradientRight ||
    animation === ElementAnimation.GradientUp ||
    animation === ElementAnimation.GradientDown
  );
}
