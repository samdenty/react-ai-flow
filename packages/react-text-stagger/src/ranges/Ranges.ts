import { AnimatedBoxOptions } from "../element/AnimatedBox.js";
import { Stagger } from "../stagger/index.js";
import { Box } from "./Box.js";

export type ComputedContent = Range | string;

export abstract class Ranges<T extends Box> {
  #boundingRect?: DOMRect;
  #boundingBox?: Box<this>;

  rects: DOMRect[];

  constructor(
    public stagger: Stagger,
    public computedContent: ComputedContent[],
    public relativeTo: { element: HTMLElement; rect: DOMRect },
    public options: AnimatedBoxOptions
  ) {
    this.rects = this.scanRects();
  }

  scanRects() {
    // Get all individual rects
    const allRects = this.ranges.flatMap((range) => [
      ...range.getClientRects(),
    ]);

    this.rects = Ranges.optimizeRects(allRects);

    this.#boundingRect = undefined;
    this.#boundingRect = undefined;

    return this.rects;
  }

  private static optimizeRects(rects: DOMRect[]) {
    const TOLERANCE = 1; // 1px tolerance for position matching

    return rects.reduce<DOMRect[]>((merged, currentRect) => {
      // If merged is empty, start with current rect
      if (merged.length === 0) {
        return [currentRect];
      }

      // Try to find a rectangle to merge with
      const mergeIndex = merged.findIndex((existingRect) => {
        // Check if same height and vertical alignment
        const sameHeight =
          Math.abs(existingRect.height - currentRect.height) <= TOLERANCE;
        const sameTop =
          Math.abs(existingRect.top - currentRect.top) <= TOLERANCE;

        // Check horizontal relationships
        const isAdjacent =
          Math.abs(existingRect.left - currentRect.right) <= TOLERANCE ||
          Math.abs(existingRect.right - currentRect.left) <= TOLERANCE;

        const isOverlapping =
          existingRect.left <= currentRect.right + TOLERANCE &&
          currentRect.left <= existingRect.right + TOLERANCE;

        // Check containment
        const rect1ContainsRect2 =
          existingRect.left <= currentRect.left + TOLERANCE &&
          existingRect.right >= currentRect.right - TOLERANCE &&
          existingRect.top <= currentRect.top + TOLERANCE &&
          existingRect.bottom >= currentRect.bottom - TOLERANCE;

        const rect2ContainsRect1 =
          currentRect.left <= existingRect.left + TOLERANCE &&
          currentRect.right >= existingRect.right - TOLERANCE &&
          currentRect.top <= existingRect.top + TOLERANCE &&
          currentRect.bottom >= existingRect.bottom - TOLERANCE;

        return (
          (sameHeight && sameTop && (isAdjacent || isOverlapping)) ||
          rect1ContainsRect2 ||
          rect2ContainsRect1
        );
      });

      if (mergeIndex === -1) {
        // No merge possible, add as new rectangle
        return [...merged, currentRect];
      }

      // Create merged rectangle
      const existingRect = merged[mergeIndex];
      const newRect = new DOMRect(
        Math.min(existingRect.left, currentRect.left),
        Math.min(existingRect.top, currentRect.top),
        Math.max(existingRect.right, currentRect.right) -
          Math.min(existingRect.left, currentRect.left),
        Math.max(existingRect.bottom, currentRect.bottom) -
          Math.min(existingRect.top, currentRect.top)
      );

      // Update merged array with new rectangle
      return merged.map((rect, i) => (i === mergeIndex ? newRect : rect));
    }, []);
  }

  trimComputedRanges(start: number, end: number) {
    return this.computedContentOffsets.flatMap((pos) => {
      if (pos.end <= start || pos.start >= end) {
        return [];
      }

      const trimFromStart = Math.max(0, start - pos.start);
      const trimFromEnd = Math.max(0, pos.end - end);

      if (typeof pos.content === "string" || (!trimFromStart && !trimFromEnd)) {
        return pos.content;
      }

      const trimmedRange = pos.content.cloneRange();

      const startContainer =
        trimmedRange.commonAncestorContainer.parentElement ?? document.body;
      const walker = document.createTreeWalker(
        startContainer,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) =>
            trimmedRange.intersectsNode(node)
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT,
        }
      );

      if (trimFromStart) {
        let charCount = -trimmedRange.startOffset;

        while (walker.nextNode()) {
          const node = walker.currentNode as Text;
          const totalWithNode = charCount + node.length;

          if (totalWithNode >= trimFromStart) {
            trimmedRange.setStart(node, trimFromStart - charCount);
            break;
          }

          charCount = totalWithNode;
        }
      }

      if (trimFromEnd) {
        walker.currentNode = startContainer;
        if (!walker.lastChild()) {
          console.log("lastChild is null");
          return trimmedRange;
        }

        let totalWithNode = -(
          trimmedRange.endContainer.textContent!.length - trimmedRange.endOffset
        );

        do {
          const node = walker.currentNode as Text;
          totalWithNode += node.length;

          if (totalWithNode >= trimFromEnd) {
            trimmedRange.setEnd(node, totalWithNode - trimFromEnd);
            break;
          }
        } while (walker.previousNode());
      }

      return trimmedRange;
    });
  }

  get computedContentOffsets() {
    let computedOffset = 0;

    return this.computedContent.map((content) => {
      const length = content.toString().length;
      const offset = {
        content,
        start: computedOffset,
        end: computedOffset + length,
      };
      computedOffset += length;
      return offset;
    });
  }

  get ranges(): readonly Range[] {
    return this.computedContent.filter(
      (content) => typeof content !== "string"
    );
  }

  get commonAncestorContainer() {
    const [firstRange, ...restRanges] = this.ranges;
    if (!firstRange) return null;

    let ancestor: Node | null = firstRange.commonAncestorContainer;

    for (const range of restRanges) {
      while (
        ancestor &&
        !(
          ancestor.contains(range.commonAncestorContainer) ||
          ancestor === range.commonAncestorContainer
        )
      ) {
        ancestor = ancestor.parentNode;
      }
    }

    return ancestor ?? document.body;
  }

  get textContent() {
    return this.ranges.join("");
  }

  get computedTextContent() {
    return this.computedContent.join("");
  }

  toString() {
    return this.computedTextContent;
  }

  get boundingRect(): DOMRect {
    return (this.#boundingRect ??= this.rects.reduce((box, current) => {
      const left = Math.min(box.left, current.left);
      const top = Math.min(box.top, current.top);
      const right = Math.max(box.right, current.right);
      const bottom = Math.max(box.bottom, current.bottom);

      return new DOMRect(left, top, right - left, bottom - top);
    }, new DOMRect()));
  }

  get boundingBox() {
    return (this.#boundingBox ??= new Box(
      this,
      this.boundingRect,
      this.relativeTo,
      this.options
    ));
  }

  abstract get boxes(): T[];
}
