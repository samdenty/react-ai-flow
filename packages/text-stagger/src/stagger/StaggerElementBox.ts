import { Box, TextLine, type SplitterImpl } from "../text/index.js";
import {
  ElementAnimation,
  type ElementOptions,
  StaggerElement,
} from "./StaggerElement.js";

export interface StaggerElementBoxOptions
  extends SplitterImpl<ElementOptions> {}

export class StaggerElementBox extends Box<StaggerElement> {
  #line?: TextLine;

  progress = 0;

  static DEFAULT_GRADIENT_WIDTH = 100;

  get element() {
    return this.parent;
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

  get gradientWidth() {
    let cssLiteral = this.options.gradientWidth;

    if (
      this.options.animation !== ElementAnimation.GradientReveal ||
      cssLiteral == null ||
      this.progress === 0 ||
      this.progress === 1
    ) {
      return StaggerElementBox.DEFAULT_GRADIENT_WIDTH;
    }

    if (typeof cssLiteral === "function") {
      cssLiteral = cssLiteral(this);

      if (cssLiteral == null) {
        return StaggerElementBox.DEFAULT_GRADIENT_WIDTH;
      }
    }

    return this.parent.stagger.convertToPx(cssLiteral, this, this.relativeTo);
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      progress: this.progress,
      gradientWidth: this.gradientWidth,
      isLast: this.isLast,
    };
  }
}

export type SerializedStaggerElementBox = ReturnType<
  StaggerElementBox["toJSON"]
>;
