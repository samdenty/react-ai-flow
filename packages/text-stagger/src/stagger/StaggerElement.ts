import { Ranges, type RangesChildNode, Text } from "../text/index.js";
import { mergeObject } from "../utils/mergeObject.js";
import {
  type SerializedStaggerElementBox,
  StaggerElementBox,
} from "./StaggerElementBox.js";

export const enum ElementAnimation {
  FadeIn = "fade-in",
  GradientReveal = "gradient-reveal",
}

export interface ElementOptions {
  animation?: ElementAnimation | `${ElementAnimation}`;
  gradientWidth?:
    | string
    | number
    | ((box: StaggerElementBox) => string | number | undefined);
  duration?: number;
  delay?: number;
}

let ID = 0;

export type AnimationDuration = number | CustomAnimationDuration;
export type CustomAnimationDuration = (element: StaggerElement) => number;

export class StaggerElement extends Ranges<StaggerElementBox, Text> {
  id = ++ID;

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

  constructor(
    public text: Text,
    childNodes: RangesChildNode[],
    options?: ElementOptions
  ) {
    super(text, mergeObject(text.options, options), text.container);

    this.childNodes = childNodes;
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
      textContent: this.textContent,
      animation: this.animation,
      boxes: this.boxes as SerializedStaggerElementBox[],
      isLast: this.isLast,
    };
  }
}

export type SerializedStaggerElement = ReturnType<StaggerElement["toJSON"]>;
