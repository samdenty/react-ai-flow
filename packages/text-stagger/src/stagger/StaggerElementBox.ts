import { Box, TextLine, SplitterImpl } from "../text/index.js";
import {
  ElementAnimation,
  ElementOptions,
  StaggerElement,
} from "./StaggerElement.js";

export interface StaggerElementBoxOptions
  extends SplitterImpl<ElementOptions> {}

export class StaggerElementBox extends Box<StaggerElement> {
  #line?: TextLine;

  progress = 0;

  get element() {
    return this.parent;
  }

  get text() {
    return this.element.text;
  }

  get line() {
    const TOLERANCE = 1; // 1px tolerance for position matching

    return (this.#line ??= this.text.lines.find(
      ({ boundingRect: { top, bottom, left, right } }) => {
        return (
          top <= this.rect.top + TOLERANCE &&
          bottom >= this.rect.bottom - TOLERANCE &&
          left <= this.rect.left + TOLERANCE &&
          right >= this.rect.right - TOLERANCE
        );
      }
    ));
  }

  get gradientWidth() {
    let cssLiteral = this.options.gradientWidth;

    if (
      this.options.animation !== ElementAnimation.GradientReveal ||
      cssLiteral == null ||
      this.progress === 0 ||
      this.progress === 1
    ) {
      return undefined;
    }

    if (typeof cssLiteral === "function") {
      cssLiteral = cssLiteral(this);

      if (cssLiteral == null) {
        return undefined;
      }
    }

    return this.parent.stagger.convertToPx(
      cssLiteral,
      this,
      this.relativeTo?.element
    );
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      progress: this.progress,
      gradientWidth: this.gradientWidth,
    };
  }
}

export type SerializedStaggerElementBox = ReturnType<
  StaggerElementBox["toJSON"]
>;
