import { ElementOptions } from "../element/index.js";
import { Ranges } from "./Ranges.js";

export class Box<T extends Ranges<any> = Ranges<any>> {
  constructor(
    public parent: T,
    public rect: DOMRect,
    public relativeTo: { element: HTMLElement; rect: DOMRect },
    public options: ElementOptions
  ) {}

  get stagger() {
    return this.parent.stagger;
  }

  get top() {
    return this.rect.top - this.relativeTo.rect.top;
  }

  get left() {
    return this.rect.left - this.relativeTo.rect.left;
  }

  get width() {
    return this.rect.width;
  }

  get height() {
    return this.rect.height;
  }

  get bottom() {
    return this.top + this.height;
  }

  get right() {
    return this.left + this.width;
  }

  toJSON() {
    return {
      top: this.top,
      left: this.left,
      width: this.width,
      height: this.height,
    };
  }
}
