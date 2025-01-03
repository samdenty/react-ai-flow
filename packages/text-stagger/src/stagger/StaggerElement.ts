import { Ranges, Text } from "../text/index.js";
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
    | ((box: StaggerElementBox) => string | number);
  duration?: number;
  delay?: number;
}

export type AnimationDuration = number | CustomAnimationDuration;
export type CustomAnimationDuration = (element: StaggerElement) => number;

export class StaggerElement extends Ranges<StaggerElementBox> {
  #boxes?: StaggerElementBox[];

  constructor(
    public text: Text,
    computedContent: (string | Range)[],
    options?: ElementOptions
  ) {
    super(
      text.stagger,
      computedContent,
      text.relativeTo,
      StaggerElement.mergeOptions(text.options, options)
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

  static mergeOptions<A extends ElementOptions, B extends ElementOptions>(
    options: A | undefined,
    newOptions: B | undefined
  ): A & B {
    let {
      animation = options?.animation,
      duration = options?.duration,
      delay = options?.delay,
      gradientWidth = options?.gradientWidth,
    } = newOptions || {};

    return {
      ...options,
      ...newOptions,
      ...(animation && { animation }),
      ...(duration && { duration }),
      ...(delay && { delay }),
      ...(gradientWidth && { gradientWidth }),
    } as A & B;
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
