import { type ElementOptions } from "../stagger/index.js";
import { Text } from "./Text.js";
import { Box, Ranges, type RangesChildNode } from "./Ranges.js";
import { mergeObject } from "../utils/mergeObject.js";
export class TextLine extends Ranges<Box, Text> {
  startOfText = false;
  endOfText = false;

  id: string;

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

  scanBoxes(rects: DOMRect[][]) {
    return rects.flat().map((rect) => {
      return new Box(
        this,
        this.options,
        this.container,
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
      text.maskContainer,
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
              const mid = Math.ceil((wrapStart + wrapEnd) / 2);

              range.setStart(textNode, start);
              range.setEnd(textNode, mid);
              newLine.childNodes = [range];

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

            newLine.childNodes = [range];
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
