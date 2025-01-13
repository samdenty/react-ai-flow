import { type ElementOptions } from "../stagger/index.js";
import { Text } from "./Text.js";
import { Box, Ranges, type RangesChildNode } from "./Ranges.js";
import { mergeObject } from "../utils/mergeObject.js";

export class TextLine extends Ranges<Box, Text> {
  startOfText = false;
  endOfText = false;

  private constructor(
    public text: Text,
    public index: number,
    public blockParent: HTMLElement,
    public startOfBlock: boolean,
    public endOfBlock: boolean,
    ranges: Range[],
    options?: ElementOptions
  ) {
    super(text, mergeObject(text.options, options), text.relativeTo);
    this.childNodes = ranges;
  }

  scanBoxes() {
    const allRects = this.ranges.flatMap((range) => [
      ...range.getClientRects(),
    ]);

    const rects = optimizeRects(allRects);

    return rects.map((rect) => {
      return new Box(
        this,
        this.options,
        this.relativeTo,
        rect.top - this.text.top,
        rect.left - this.text.left,
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
    const lastNode = lastRange?.endContainer;
    const lastOffset = lastRange?.endOffset ?? 0;

    const walker = document.createTreeWalker(
      text.relativeTo,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (!lastNode || lastNode === node) {
            return NodeFilter.FILTER_ACCEPT;
          }

          const position = lastNode.compareDocumentPosition(node);
          if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
            return NodeFilter.FILTER_ACCEPT;
          }

          return NodeFilter.FILTER_REJECT;
        },
      }
    );

    const textNodes: {
      textNode: globalThis.Text;
      blockParent: HTMLElement;
      startOfBlock: boolean;
      endOfBlock: boolean;
      textContent: string;
    }[] = [];

    const checkParents = createParentChecker();

    while (walker.nextNode()) {
      const textNode = walker.currentNode as globalThis.Text;

      const { textContent } = textNode;
      if (!textContent) {
        continue;
      }

      const { isHidden, blockParent } = checkParents(textNode);
      if (isHidden) {
        continue;
      }

      const lastTextNode = textNodes.at(-1);
      const startOfBlock = blockParent !== lastTextNode?.blockParent;

      if (lastTextNode) {
        lastTextNode.endOfBlock ||= startOfBlock;
      }

      textNodes.push({
        blockParent,
        textNode,
        textContent,
        startOfBlock,
        endOfBlock: false,
      });
    }

    textNodes.forEach(
      ({ textNode, startOfBlock, endOfBlock, textContent, blockParent }) => {
        textNodes;

        let start = textNode === lastNode ? lastOffset : 0;

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

          const [firstBox, secondBox] = newLine.boxes;

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
              const mid = Math.floor((wrapStart + wrapEnd) / 2);

              range.setStart(textNode, start);
              range.setEnd(textNode, mid);
              newLine.boxes = newLine.scanBoxes();

              const isWrapped =
                newLine.boxes[0].top > top || newLine.boxes.length > 1;

              if (isWrapped) {
                wrapEnd = mid - 1;
              } else {
                wrapStart = mid + 1;
              }
            }

            // After the loop, wrapEnd will be at the last position that doesn't cause wrapping
            range.setStart(textNode, start);
            range.setEnd(textNode, wrapEnd);

            newLine.boxes = newLine.scanBoxes();
          }

          // Find existing line with same vertical position
          const existingLine = lines.find(
            (line) =>
              Math.abs(line.top - newLine.top) <= 1 &&
              Math.abs(line.bottom - newLine.bottom) <= 1
          );

          if (existingLine) {
            const childNodes = [...existingLine.childNodes];
            const rangeToExtendIndex = childNodes.findLastIndex(
              (content) => typeof content !== "string"
            );
            const rangeToExtend = (
              childNodes[rangeToExtendIndex] as Range | undefined
            )?.cloneRange();

            rangeToExtend?.setEnd(range.endContainer, range.endOffset);

            if (
              rangeToExtend?.toString() ===
              existingLine.textContent + range.toString()
            ) {
              childNodes[rangeToExtendIndex] = rangeToExtend;
            } else {
              childNodes.push(range);
            }

            existingLine.childNodes = childNodes;
          } else {
            lines.push(newLine);
          }

          // Move to next position
          start = range.endOffset;
        }
      }
    );

    // Sort lines by vertical position
    lines.sort((a, b) => a.top - b.top);

    lines.forEach((line, i) => {
      line.startOfText = i === 0;
      line.endOfText = i === lines.length - 1;
    });

    return lines;
  }
}

function createParentChecker() {
  const styleCache = new WeakMap<HTMLElement, CSSStyleDeclaration>();
  const blockParentCache = new WeakMap<Element, HTMLElement | null>();

  return function checkNodeParents(node: Node) {
    let blockParent: HTMLElement | null = null;
    let parent = node.parentElement;

    while (parent) {
      // Check if parent is hidden
      let style = styleCache.get(parent);
      if (style == null) {
        style = getComputedStyle(parent);
        styleCache.set(parent, style);
      }

      const hidden =
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0" ||
        (parent.offsetParent === null &&
          parent !== document.body &&
          parent !== document.documentElement);

      if (hidden) {
        return { isHidden: true, blockParent: null } as const;
      }

      // Check if it's a block parent (if we haven't found one yet)
      if (
        (!blockParent && style.display === "block") ||
        style.display === "list-item" ||
        style.display === "table"
      ) {
        blockParent = parent;
      }

      blockParentCache.set(parent, blockParent);

      parent = parent.parentElement;
    }

    blockParent ??= document.body;

    return { isHidden: false, blockParent } as const;
  };
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
