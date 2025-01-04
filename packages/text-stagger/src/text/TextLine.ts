import { ElementOptions, StaggerElementBox } from "../stagger/index.js";
import { Text } from "./Text.js";
import { Ranges } from "./Ranges.js";
import { mergeObject } from "../utils/mergeObject.js";

export class TextLine extends Ranges<StaggerElementBox> {
  startOfText = false;
  #endOfText = false;

  private constructor(
    public text: Text,
    public index: number,
    public blockParent: HTMLElement,
    public startOfBlock: boolean,
    public endOfBlock: boolean,
    ranges: Range[],
    options?: ElementOptions
  ) {
    super(
      text.stagger,
      [...ranges, endOfBlock ? "\r\n" : "\n"],
      text.relativeTo,
      mergeObject(text.options, options)
    );
  }

  get endOfText() {
    return this.#endOfText;
  }

  set endOfText(endOfText: boolean) {
    this.#endOfText = endOfText;

    this.childNodes = [
      ...this.childNodes.slice(0, -1),
      endOfText ? "" : this.endOfBlock ? "\r\n" : "\n",
    ];
  }

  get boxes(): StaggerElementBox[] {
    return this.text.boxes.filter(({ line }) => line === this);
  }

  static scanLines(text: Text): TextLine[] {
    const lines: TextLine[] = [...text.lines];
    const lastRange = lines.at(-1)?.ranges.at(-1);
    const lastNode = lastRange?.endContainer;
    const lastOffset = lastRange?.endOffset ?? 0;

    const walker = document.createTreeWalker(
      text.relativeTo.element,
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

          const [firstRect, secondRect] = newLine.rects;

          // Handle the case where the node has no content
          if (!firstRect) {
            return;
          }

          const { top } = firstRect;

          if (secondRect) {
            let wrapStart = start;
            let wrapEnd = textContent.length;
            let isWrapped = false;

            // Binary search for the break point
            while (wrapStart + 1 < wrapEnd) {
              const mid = Math.floor((wrapStart + wrapEnd) / 2);

              range.setStart(textNode, wrapStart);
              range.setEnd(textNode, mid);
              newLine.scanRects();

              isWrapped = newLine.rects[0].top > top;

              if (newLine.rects.length > 1 || isWrapped) {
                wrapEnd = mid;
              } else {
                wrapStart = mid;
              }
            }

            range.setStart(textNode, start);
            range.setEnd(textNode, isWrapped ? wrapStart : wrapEnd);

            newLine.scanRects();
          }

          // Find existing line with same vertical position
          const existingLine = lines.find(
            (line) =>
              Math.abs(line.boundingBox.top - newLine.boundingBox.top) <= 1 &&
              Math.abs(line.boundingBox.bottom - newLine.boundingBox.bottom) <=
                1
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
    lines.sort((a, b) => a.boundingBox.top - b.boundingBox.top);

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
