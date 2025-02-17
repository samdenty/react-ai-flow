import type {
  Stagger,
  StaggerElementBoxOptions,
  ElementOptions,
} from "../stagger/index.js";
import type { Text } from "./Text.js";

export class Box<
  T extends Ranges<any, any> | Stagger = Ranges<any, any> | Stagger
> {
  #disposers = new Set<VoidFunction>();
  #container!: HTMLElement;

  stagger: Stagger;

  #parentLeft: number;
  #parentTop: number;
  #rectListeners = new Set<() => void>();

  get container() {
    return this.#container;
  }

  set container(container: HTMLElement) {
    this.#container = container;
  }

  constructor(
    public parent: T,
    public options: ElementOptions,
    element: HTMLElement,
    private relativeTopToParent = 0,
    private relativeLeftToParent = 0,
    public width = 0,
    public height = 0
  ) {
    if (parent instanceof Ranges) {
      this.stagger = parent.stagger;
      this.#parentLeft = parent.left;
      this.#parentTop = parent.top;

      const listener = () => {
        this.#parentLeft = parent.left;
        this.#parentTop = parent.top;
      };

      let parentRanges = parent;

      do {
        const parent = parentRanges;
        parent.#rectListeners.add(listener);

        this.#disposers.add(() => {
          parent.#rectListeners.delete(listener);
        });
      } while (
        (parentRanges = parentRanges.parent) &&
        parentRanges instanceof Ranges
      );
    } else {
      this.stagger = parent;
      this.#parentTop = 0;
      this.#parentLeft = 0;
    }

    this.container = element;
  }

  get relativeToParent(): {
    top: number;
    left: number;
    bottom: number;
    right: number;
    height: number;
    width: number;
  } {
    return this.relativeTo(this.parent);
  }

  static calculateRelative(
    from: {
      top: number;
      left: number;
      bottom: number;
      right: number;
      height: number;
      width: number;
    },
    to:
      | {
          top: number;
          left: number;
          bottom: number;
          right: number;
        }
      | {}
  ) {
    if (!(to instanceof Box)) {
      return {
        top: from.top,
        left: from.left,
        bottom: from.bottom,
        right: from.right,
        width: from.width,
        height: from.height,
      };
    }

    return {
      top: from.top - to.top,
      left: from.left - to.left,
      bottom: from.bottom - to.top,
      right: from.right - to.left,
      width: from.width,
      height: from.height,
    };
  }

  set top(top: number) {
    const oldRelativeTop = this.relativeTopToParent;
    this.relativeTopToParent = top - (this.#parentTop ?? 0);

    if (oldRelativeTop !== this.relativeTopToParent) {
      this.#rectListeners.forEach((listener) => listener());
    }
  }

  set left(left: number) {
    const oldRelativeLeft = this.relativeLeftToParent;
    this.relativeLeftToParent = left - (this.#parentLeft ?? 0);

    if (oldRelativeLeft !== this.relativeLeftToParent) {
      this.#rectListeners.forEach((listener) => listener());
    }
  }

  get top(): number {
    return this.relativeTopToParent + this.#parentTop;
  }

  get left(): number {
    return this.relativeLeftToParent + this.#parentLeft;
  }

  relativeTo(
    other:
      | {
          top: number;
          left: number;
          bottom: number;
          right: number;
        }
      | {}
  ) {
    return Box.calculateRelative(this, other);
  }

  set bottom(bottom: number) {
    this.height = bottom - this.top;
  }

  get bottom() {
    return this.top + this.height;
  }

  set right(right: number) {
    this.width = right - this.left;
    if (this.width === 11531.6325) {
      debugger;
    }
  }

  get right() {
    return this.left + this.width;
  }

  dispose() {
    this.#disposers.forEach((dispose) => dispose());
  }
}

export type RangesChildNode = Range | string;

export abstract class Ranges<
  T extends Box<any>,
  U extends Ranges<any, any> | Stagger
> extends Box<U> {
  #boxes: T[] = [];
  #childNodes: readonly RangesChildNode[] = [];
  ranges: Range[] = [];

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

  abstract text: Text;

  get boxes() {
    return this.#boxes;
  }

  constructor(
    parent: U,
    public options: StaggerElementBoxOptions,
    element: HTMLElement,
    childNodes?: RangesChildNode[]
  ) {
    super(parent, options, element);

    if (childNodes) {
      this.childNodes = childNodes;
    }
  }

  childText: string[] = [];

  set childNodes(childNodes: RangesChildNode[]) {
    this.#childNodes = Object.freeze([...childNodes]);

    this.childText = this.#childNodes.map((childNode) => childNode.toString());
    this.innerText = this.childText.join("");

    this.textContent = this.childText
      .filter((_, i) => typeof this.#childNodes[i] !== "string")
      .join("");

    this.ranges = this.childNodes.filter(
      (content) => typeof content !== "string"
    );

    this.rescan();
  }

  rescan() {
    const rects = this.scanRects();

    this.updateBounds(rects);

    this.#boxes.forEach((box) => box.dispose());
    this.#boxes = this.scanBoxes(rects);
  }

  get childNodes(): readonly RangesChildNode[] {
    return this.#childNodes;
  }

  updateBounds(rects?: DOMRect[][]) {
    let scanned = false;
    if (!rects) {
      rects = this.scanRects();
      scanned = true;
    }

    const bounds = rects.flat().reduce(
      (bounds, rect, i) => {
        if ((this as any) !== this.text && scanned) {
          this.text.updateBounds();
        }

        if (i === 0) {
          return {
            top: rect.top,
            left: rect.left,
            bottom: rect.bottom,
            right: rect.right,
          };
        }

        return {
          top: Math.min(rect.top, bounds.top),
          left: Math.min(rect.left, bounds.left),
          bottom: Math.max(rect.bottom, bounds.bottom),
          right: Math.max(rect.right, bounds.right),
        };
      },
      { top: 0, left: 0, bottom: 0, right: 0 }
    );

    const changed =
      bounds.top !== this.top ||
      bounds.left !== this.left ||
      bounds.bottom !== this.bottom ||
      bounds.right !== this.right;

    Object.assign(this, bounds);

    if (changed) {
      this.stagger.invalidatePositions();
    }
  }

  scanRects() {
    return this.ranges.map((range) => {
      return optimizeRects([...range.getClientRects()]);
    });
  }

  abstract scanBoxes(rects: DOMRect[][]): T[];

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
            const node = commonAncestorContainer as globalThis.Text;
            const startOffset = trimmedRange.startOffset + trimFromStart;
            trimmedRange.setStart(node, startOffset);
            offsetsCache.set(start, { node, offset: startOffset });
          } else {
            let charCount = -trimmedRange.startOffset;

            while (walker.nextNode()) {
              const node = walker.currentNode as globalThis.Text;
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
            const node = commonAncestorContainer as globalThis.Text;
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
              const node = walker.currentNode as globalThis.Text;
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

  toString() {
    return this.innerText;
  }
}

function optimizeRects(rects: DOMRect[]) {
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
      const sameTop = Math.abs(existingRect.top - currentRect.top) <= TOLERANCE;

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
