import { Ranges, RangesChildNode, Text } from "../text/index.js";
import { mergeObject } from "../utils/mergeObject.js";
import {
  SerializedStaggerElementBox,
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

export type AnimationDuration = number | CustomAnimationDuration;
export type CustomAnimationDuration = (element: StaggerElement) => number;

export class StaggerElement extends Ranges<StaggerElementBox> {
  boxes: StaggerElementBox[] = [];

  constructor(
    public text: Text,
    childNodes: RangesChildNode[],
    options?: ElementOptions
  ) {
    super(text.stagger, mergeObject(text.options, options), text.relativeTo);

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

  override get childNodes(): readonly RangesChildNode[] {
    return super.childNodes;
  }

  override set childNodes(childNodes: RangesChildNode[]) {
    const originalProgress = this.progress;
    const originalWidth =
      originalProgress * this.boxes.reduce((acc, box) => acc + box.width, 0);

    super.childNodes = childNodes;

    this.boxes = this.rects.map((rect) => new StaggerElementBox(this, rect));

    const newWidth = this.boxes.reduce((acc, box) => acc + box.width, 0);

    this.progress = originalWidth / newWidth;
  }

  set progress(progress: number) {
    if (!this.boxes.length) {
      return;
    }

    const boxCount = this.boxes.length;
    const progressPerBox = 1 / boxCount;

    // Only check last box when it's relevant
    const isLastElement = this.text.elements.at(-1) === this;

    this.boxes.forEach((box, i) => {
      const isLastBox = this.text.isLast && isLastElement && i === boxCount - 1;

      if (this.animation === ElementAnimation.FadeIn) {
        box.progress = progress;
        return;
      }

      const boxStartProgress = i * progressPerBox;
      let boxProgress = Math.min(
        1,
        Math.max(0, (progress - boxStartProgress) / progressPerBox)
      );

      if (isLastBox) {
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
      textContent: this.textContent,
      animation: this.animation,
      boxes: this.boxes as SerializedStaggerElementBox[],
    };
  }
}

export type SerializedStaggerElement = ReturnType<StaggerElement["toJSON"]>;
