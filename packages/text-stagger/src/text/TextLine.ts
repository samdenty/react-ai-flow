import { type ElementOptions } from "../stagger/index.js";
import { Text } from "./Text.js";
import {
  Box,
  preserveOptimizeRects,
  Ranges,
  type RangesChildNode,
} from "./Ranges.js";
import { mergeObject } from "../utils/mergeObject.js";

export class TextLine extends Ranges<Box, Text> {
  startOfText = false;
  endOfText = false;

  id: string;

  start = 0;
  end = 0;

  private constructor(
    public text: Text,
    public index: number,
    public blockParent: HTMLElement,
    public startOfBlock: boolean,
    public endOfBlock: boolean,
    ranges: Range[],
    options?: ElementOptions
  ) {
    super(text, mergeObject(text.options, options), text.container);
    this.childNodes = ranges;
    this.id = `${this.text.id}:${index}`;
  }

  static getLines<T extends Ranges<any, any>>(
    range: T,
    position?: { start?: number; end?: number }
  ): T extends { lines: TextLine[] } ? TextLine[] : null {
    if (
      !("lines" in range) ||
      !Array.isArray(range.lines) ||
      !range.lines.every((line) => line instanceof TextLine)
    ) {
      return null as T extends { lines: TextLine[] } ? never : null;
    }

    let offset = 0;

    return range.lines.filter((line) => {
      const lineStart = (line.childNodesOffsets.at(0)?.start ?? 0) + offset;
      const lineEnd = (line.childNodesOffsets.at(-1)?.end ?? 0) + offset;

      offset = lineEnd;

      return (
        (typeof position?.start !== "number" || position.start >= lineStart) &&
        (typeof position?.end !== "number" || position.end <= lineEnd)
      );
    }) as T extends { lines: TextLine[] } ? TextLine[] : never;
  }

  comparePosition(other: this): number {
    if (this.text !== other.text) {
      return super.comparePosition(other);
    }

    return this.index - other.index;
  }

  scanBoxes(rects: DOMRect[][]) {
    return preserveOptimizeRects(rects, (rect) => {
      const { top, left } = Box.calculateRelative(rect, this);

      return new Box(
        this,
        this.options,
        this.container,
        top,
        left,
        rect.width,
        rect.height
      );
    });
  }

  override set childNodes(ranges: RangesChildNode[]) {
    super.childNodes = ranges.filter((node) => typeof node !== "string");
  }

  override get childNodes(): readonly RangesChildNode[] {
    if (this.innerText.endsWith("\n") || this.endOfText) {
      return super.childNodes;
    }

    if (this.endOfBlock) {
      return [...super.childNodes, "\r\n"];
    }

    return [...super.childNodes, "\n"];
  }

  static scanLines(text: Text): TextLine[] {
    const lines: TextLine[] = [...text.lines];
    const lastRange = lines.at(-1)?.ranges.at(-1);
    const lastScannedNode = lastRange?.endContainer;
    const lastScannedOffset = lastRange?.endOffset ?? 0;

    let foundFollowing = false;

    const walker = document.createTreeWalker(
      text.container,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (!lastScannedNode || lastScannedNode === node || foundFollowing) {
            return NodeFilter.FILTER_ACCEPT;
          }

          const position = lastScannedNode.compareDocumentPosition(node);
          if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
            foundFollowing = true;
            return NodeFilter.FILTER_ACCEPT;
          }

          return NodeFilter.FILTER_REJECT;
        },
      }
    );

    const nodes: globalThis.Text[] = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode as globalThis.Text);
    }

    const checkParents = createParentChecker(text);

    const textNodes = nodes
      .flatMap((textNode) => {
        const { textContent } = textNode;
        if (!textContent) {
          return [];
        }

        const { isHidden, subtext, style, blockParent } =
          checkParents(textNode);

        if (isHidden) {
          return [];
        }

        return { blockParent, textNode, textContent, subtext, style };
      })
      .map((node, i, textNodes) => {
        const prev = textNodes[i - 1];
        const next = textNodes[i + 1];
        const { subtext, blockParent } = node;

        const newNode = Object.assign(node, {
          startOfBlock: blockParent && blockParent !== prev?.blockParent,
          endOfBlock: blockParent && blockParent !== next?.blockParent,
          startOfSubtext: subtext && subtext !== prev?.subtext,
          endOfSubtext: subtext && subtext !== next?.subtext,
        });

        return Object.assign(newNode, {
          prev: prev as typeof newNode,
          next: next as typeof newNode,
        });
      })
      .map((node) => {
        const newRange = node.startOfSubtext || node.prev?.endOfSubtext;
        return Object.assign(node, { newRange });
      });

    const lastTextNode = textNodes.at(-1);
    if (!lastTextNode) {
      return [];
    }

    textNodes.forEach((node) => {
      let {
        textNode,
        startOfBlock,
        newRange,
        endOfBlock,
        textContent,
        blockParent,
      } = node;

      let start = textNode === lastScannedNode ? lastScannedOffset : 0;

      while (start < textContent.length) {
        const range = document.createRange();

        // Start with maximum possible range
        range.setStart(textNode, start);
        range.setEnd(textNode, textContent.length);

        let newLine = new TextLine(
          text,
          lines.length,
          blockParent,
          startOfBlock,
          endOfBlock,
          [range],
          text.options
        );

        const [firstBox, secondBox] = newLine.uniqueBoxes;

        // Handle the case where the node has no content
        if (!firstBox) {
          return;
        }

        const { top } = firstBox;

        if (secondBox) {
          let wrapStart = start;
          let wrapEnd = textContent.length;

          // Binary search for the break point
          while (wrapStart <= wrapEnd) {
            const mid = Math.ceil((wrapStart + wrapEnd) / 2);

            range.setStart(textNode, start);
            range.setEnd(textNode, mid);
            newLine.childNodes = [range];

            const isWrapped =
              newLine.uniqueBoxes[0]!.top > top ||
              newLine.uniqueBoxes.length > 1;

            if (isWrapped) {
              wrapEnd = mid - 1;
            } else {
              wrapStart = mid + 1;
            }
          }

          // After the loop, wrapEnd will be at the last position that doesn't cause wrapping
          range.setStart(textNode, start);
          range.setEnd(textNode, wrapEnd);

          newLine.childNodes = [range];
        }

        const existingLine = lines.findLast((existingLine) => {
          const lineBoxes = existingLine.uniqueBoxes;
          const newBoxes = newLine.uniqueBoxes;

          const aroundSameLine = lineBoxes.some((box) =>
            newBoxes.some(
              (newBox) => newBox.top < box.bottom && newBox.bottom > box.top
            )
          );

          if (aroundSameLine && newLine.left >= existingLine.right) {
            return true;
          }

          if (existingLine.blockParent === newLine.blockParent) {
            return (
              Math.abs(existingLine.top - newLine.top) <= 1 &&
              Math.abs(existingLine.bottom - newLine.bottom) <= 1
            );
          }

          return aroundSameLine;
        });

        if (existingLine) {
          const ranges = [...existingLine.ranges];

          if (!newRange) {
            const lastRange = ranges.at(-1);
            const rangeToExtend = lastRange?.cloneRange();

            rangeToExtend?.setEnd(range.endContainer, range.endOffset);

            if (rangeToExtend?.toString() === `${lastRange}${range}`) {
              ranges[ranges.length - 1] = rangeToExtend;
            } else {
              ranges.push(range);
              newRange = false;
            }
          } else {
            ranges.push(range);
            newRange = false;
          }

          existingLine.childNodes = ranges;
        } else {
          newRange = false;
          lines.push(newLine);
        }

        // Move to next position
        start = range.endOffset;
      }
    });

    // Sort lines by vertical position
    lines.sort((a, b) => a.comparePosition(b));

    let offset = 0;

    lines.forEach((line, i) => {
      line.start = offset;
      line.end = offset + line.innerText.length;
      offset = line.end;

      line.startOfText = i === 0;
      line.endOfText = i === lines.length - 1;
    });

    return lines;
  }
}

function createParentChecker(text: Text) {
  const styleCache = new WeakMap<HTMLElement, CSSStyleDeclaration>();
  const blockParentCache = new WeakMap<Element, HTMLElement | null>();

  return function checkNodeParents(textNode: globalThis.Text) {
    const element = textNode.parentElement ?? document.body;

    const previousTexts = text.previousTexts;
    const excludeContainers = new Set<Node>(
      previousTexts.map((text) => {
        return text.container;
      })
    );
    excludeContainers.add(text.container);

    const ignored = previousTexts.some((text) => {
      return text.isIgnoredNode(
        element,
        true,
        (node) => !excludeContainers.has(node)
      );
    });

    if (ignored) {
      return {
        isHidden: true,
        subtext: null,
        blockParent: null,
        style: null,
        parent: null,
      } as const;
    }

    let blockParent: HTMLElement | null = null;
    let parent: HTMLElement = element;
    let style: CSSStyleDeclaration;
    let subtext: Text | null = null;

    do {
      // Check if parent is hidden
      let parentStyle = styleCache.get(parent);
      if (parentStyle == null) {
        parentStyle = getComputedStyle(parent);
        styleCache.set(parent, parentStyle);
      }

      style ??= parentStyle;

      const hidden =
        parentStyle.display === "none" ||
        parentStyle.visibility === "hidden" ||
        (parent.offsetParent === null &&
          parent !== document.body &&
          parent !== document.documentElement);

      if (hidden) {
        return {
          isHidden: true,
          subtext,
          blockParent: null,
          style: null,
          parent: null,
        } as const;
      }

      subtext =
        text.nextTexts.find((text) => text.container === parent) ?? subtext;

      const parentText =
        text.parentText ??
        text.previousTexts.find((text) => text.container === parent);

      if (parentText && parentText !== text.parent) {
        if (parentText.parent === text) {
          // infinite loop detected, this is bad
          debugger;
          throw new Error("Infinite loop detected");
        }

        parentText.createIgnoredElement(text.container);
        parentText.createIgnoredElement(text.customAnimationContainer);
        text.parent = parentText;
      }

      // Check if it's a block parent (if we haven't found one yet)
      if (
        (!blockParent && parentStyle.display === "block") ||
        parentStyle.display === "list-item" ||
        parentStyle.display === "table"
      ) {
        blockParent = parent;
      }

      blockParentCache.set(parent, blockParent);
    } while (parent.parentElement && (parent = parent.parentElement));

    blockParent ??= document.body;

    return {
      isHidden: false,
      subtext,
      blockParent,
      style,
      element,
    } as const;
  };
}
