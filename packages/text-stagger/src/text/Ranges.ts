import type {
  Stagger,
  StaggerElementBoxOptions,
  ElementOptions,
} from "../stagger/index.js";

export class Box<
  T extends Ranges<any, any> | Stagger = Ranges<any, any> | Stagger
> {
  stagger: Stagger;

  constructor(
    public parent: T,
    public options: ElementOptions,
    public relativeTo: HTMLElement,
    public top = 0,
    public left = 0,
    public width = 0,
    public height = 0
  ) {
    if (parent instanceof Ranges) {
      this.stagger = parent.stagger;
    } else {
      this.stagger = parent;
    }
  }

  set bottom(bottom: number) {
    this.height = bottom - this.top;
  }

  get bottom() {
    return this.top + this.height;
  }

  set right(right: number) {
    this.width = right - this.left;
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

export abstract class Ranges<
  T extends Box<any>,
  U extends Ranges<any, any> | Stagger
> extends Box<U> {
  #childNodes: readonly RangesChildNode[] = [];

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

  boxes: T[] = [];

  constructor(
    parent: U,
    public options: StaggerElementBoxOptions,
    relativeTo: HTMLElement,
    childNodes?: RangesChildNode[]
  ) {
    super(parent, options, relativeTo);

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

    this.boxes = this.scanBoxes();
  }

  get childNodes(): readonly RangesChildNode[] {
    return this.#childNodes;
  }

  abstract scanBoxes(): T[];

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
}
