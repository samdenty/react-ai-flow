import { Ranges, RangesChildNode, Text } from "../text/index.js";
import { mergeObject } from "../utils/mergeObject.js";
import { StaggerElementBox } from "./StaggerElementBox.js";

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

export type AnimationDuration = number | CustomAnimationDuration;
export type CustomAnimationDuration = (element: StaggerElement) => number;

export class StaggerElement extends Ranges<StaggerElementBox> {
  #boxes?: StaggerElementBox[];

  constructor(
    public text: Text,
    childNodes: RangesChildNode[],
    options?: ElementOptions
  ) {
    super(
      text.stagger,
      childNodes,
      text.relativeTo,
      mergeObject(text.options, options)
    );
  }

  get progress(): number {
    return (
      this.boxes.reduce((acc, box) => acc + box.progress, 0) / this.boxes.length
    );
  }

  set progress(progress: number) {
    const boxCount = this.boxes.length;
    const progressPerBox = 1 / boxCount;

    this.boxes.forEach((box, index) => {
      if (this.animation === ElementAnimation.FadeIn) {
        box.progress = progress;
        return;
      }

      const boxStartProgress = index * progressPerBox;
      const boxProgress = Math.min(
        1,
        Math.max(0, (progress - boxStartProgress) / progressPerBox)
      );

      box.progress = boxProgress;
    });
  }

  get animation() {
    return this.options.animation;
  }

  get boxes() {
    return (this.#boxes ??= this.rects.map(
      (rect) => new StaggerElementBox(this, rect)
    ));
  }

  toJSON(): Partial<StaggerElement> {
    return {
      textContent: this.textContent,
      animation: this.animation,
      boxes: this.boxes,
    };
  }
}
