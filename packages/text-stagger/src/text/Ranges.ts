import {
  Stagger,
  StaggerElementBoxOptions,
  ElementOptions,
} from "../stagger/index.js";

export class Box<T extends Ranges<any> = Ranges<any>> {
  relativeTo?: { element: HTMLElement; rect: DOMRect };

  constructor(public parent: T, public rect: DOMRect) {
    this.relativeTo = parent.relativeTo;
  }

  get options(): ElementOptions {
    return this.parent.options;
  }

  get stagger() {
    return this.parent.stagger;
  }

  get top() {
    return this.rect.top - (this.relativeTo?.rect.top ?? 0);
  }

  get left() {
    return this.rect.left - (this.relativeTo?.rect.left ?? 0);
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

export type SerializedBox = ReturnType<Box["toJSON"]>;

export type RangesChildNode = Range | string;

export abstract class Ranges<T extends Box> {
  #boundingRect?: DOMRect;
  #boundingBox?: Box<this>;
  #childNodes: readonly RangesChildNode[] = [];

  rects: DOMRect[] = [];

  /**
   * The text of *just* the childNodes that are ranges,
   * **excludes rendered line-breaks
   */
  textContent!: string;

  /**
   * The text of *all* the childNodes,
   * **including rendered line-breaks
   */
  innerText!: string;

  constructor(
    public stagger: Stagger,
    public options: StaggerElementBoxOptions,
    public relativeTo?: { element: HTMLElement; rect: DOMRect },
    childNodes?: RangesChildNode[]
  ) {
    if (childNodes) {
      this.childNodes = childNodes;
    }
  }

  set childNodes(childNodes: RangesChildNode[]) {
    this.#childNodes = Object.freeze([...childNodes]);

    const strings = this.#childNodes.map((childNode) => childNode.toString());

    this.innerText = strings.join("");

    this.textContent = strings
      .filter((_, i) => typeof this.#childNodes[i] !== "string")
      .join("");

    this.scanRects();
  }

  get childNodes(): readonly RangesChildNode[] {
    return this.#childNodes;
  }

  scanRects() {
    const allRects = this.ranges.flatMap((range) => [
      ...range.getClientRects(),
    ]);

    this.rects = Ranges.optimizeRects(allRects);

    this.#boundingRect = undefined;
    this.#boundingBox = undefined;

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

  createChildNodeTrimmer() {
    const childNodeOffsets = this.childNodesOffsets;
    const offsetsCache = new Map<number, { node: Node; offset: number }>();
    const lastChildCache = new WeakMap<Node, Node>();

    return (start: number, end: number) => {
      return childNodeOffsets.flatMap((pos) => {
        if (pos.end <= start || pos.start >= end) {
          return [];
        }

        const trimFromStart = Math.max(0, start - pos.start);
        const trimFromEnd = Math.max(0, pos.end - end);

        if (
          typeof pos.childNode === "string" ||
          (!trimFromStart && !trimFromEnd)
        ) {
          return pos.childNode;
        }

        const trimmedRange = pos.childNode.cloneRange();
        const { commonAncestorContainer } = trimmedRange;

        const cachedStart = trimFromStart && offsetsCache.get(start);
        const cachedEnd = trimFromEnd && offsetsCache.get(end);

        const walker = document.createTreeWalker(
          commonAncestorContainer,
          NodeFilter.SHOW_TEXT
        );

        if (cachedStart) {
          trimmedRange.setStart(cachedStart.node, cachedStart.offset);
        } else if (trimFromStart) {
          if (commonAncestorContainer.nodeType === Node.TEXT_NODE) {
            const node = commonAncestorContainer as Text;
            const startOffset = trimmedRange.startOffset + trimFromStart;
            trimmedRange.setStart(node, startOffset);
            offsetsCache.set(start, { node, offset: startOffset });
          } else {
            let charCount = -trimmedRange.startOffset;

            while (walker.nextNode()) {
              const node = walker.currentNode as Text;
              if (!trimmedRange.intersectsNode(node)) {
                continue;
              }

              const totalWithNode = charCount + node.length;

              if (totalWithNode >= trimFromStart) {
                const offset = trimFromStart - charCount;
                offsetsCache.set(start, { node, offset });
                trimmedRange.setStart(node, offset);
                break;
              }

              charCount = totalWithNode;
            }
          }
        }

        if (cachedEnd) {
          trimmedRange.setEnd(cachedEnd.node, cachedEnd.offset);
        } else if (trimFromEnd) {
          if (commonAncestorContainer.nodeType === Node.TEXT_NODE) {
            const node = commonAncestorContainer as Text;
            const endOffset = trimmedRange.endOffset - trimFromEnd;
            trimmedRange.setEnd(node, endOffset);
            offsetsCache.set(end, { node, offset: endOffset });
          } else {
            let lastChild = lastChildCache.get(commonAncestorContainer) ?? null;

            if (lastChild) {
              walker.currentNode = lastChild;
            } else {
              walker.currentNode = commonAncestorContainer;
              lastChild = walker.lastChild();

              if (!lastChild) {
                return trimmedRange;
              }

              lastChildCache.set(commonAncestorContainer, lastChild);
            }

            let totalWithNode = -(
              trimmedRange.endContainer.textContent!.length -
              trimmedRange.endOffset
            );

            do {
              const node = walker.currentNode as Text;
              if (!trimmedRange.intersectsNode(node)) {
                continue;
              }

              totalWithNode += node.length;

              if (totalWithNode >= trimFromEnd) {
                const offset = totalWithNode - trimFromEnd;
                offsetsCache.set(end, { node, offset });
                trimmedRange.setEnd(node, offset);
                break;
              }
            } while (walker.previousNode());
          }
        }

        return trimmedRange;
      });
    };
  }

  /**
   * The childNodes with the computed offsets
   */
  get childNodesOffsets() {
    let childNodeOffset = 0;

    return this.childNodes.map((childNode) => {
      const length = childNode.toString().length;
      const offset = {
        childNode,
        start: childNodeOffset,
        end: childNodeOffset + length,
      };
      childNodeOffset += length;
      return offset;
    });
  }

  /**
   * The filtered childNodes that are ranges
   */
  get ranges(): readonly Range[] {
    return this.childNodes.filter((content) => typeof content !== "string");
  }

  toString() {
    return this.innerText;
  }

  get boundingRect(): DOMRect {
    return (this.#boundingRect ??= this.rects.reduce((box, current) => {
      const left = Math.min(box.left, current.left);
      const top = Math.min(box.top, current.top);
      const right = Math.max(box.right, current.right);
      const bottom = Math.max(box.bottom, current.bottom);

      return new DOMRect(left, top, right - left, bottom - top);
    }));
  }

  get boundingBox() {
    return (this.#boundingBox ??= new Box(this, this.boundingRect));
  }

  abstract get boxes(): T[];
}
