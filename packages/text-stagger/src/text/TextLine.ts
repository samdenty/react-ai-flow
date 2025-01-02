import {
  ElementOptions,
  StaggerElement,
  StaggerElementBox,
} from "../stagger/index.js";
import { Text } from "./Text.js";
import { Ranges } from "./Ranges.js";

export class TextLine extends Ranges<StaggerElementBox> {
  private constructor(
    public text: Text,
    public index: number,
    ranges: Range[],
    options?: ElementOptions
  ) {
    super(
      text.stagger,
      [...ranges, "\n"],
      text.relativeTo,
      StaggerElement.mergeOptions(text.options, options)
    );
  }

  get boxes(): StaggerElementBox[] {
    return this.text.boxes.filter(({ line }) => line === this);
  }

  static scanLines(text: Text): TextLine[] {
    const textNodes: globalThis.Text[] = [];

    for (const range of text.ranges) {
      const walker = document.createTreeWalker(
        range.commonAncestorContainer,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) =>
            range.intersectsNode(node)
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT,
        }
      );

      let node: Node | null;
      while ((node = walker.nextNode())) {
        textNodes.push(node as globalThis.Text);
      }
    }

    const lines: TextLine[] = [];

    // Process each text node
    textNodes.forEach((textNode) => {
      const textContent = textNode.textContent;
      if (!textContent) {
        return;
      }

      let start = 0;

      while (start < textContent.length) {
        const range = document.createRange();

        // Start with maximum possible range
        range.setStart(textNode, start);
        range.setEnd(textNode, textContent.length);

        let newLine = new TextLine(text, lines.length, [range], text.options);
        const { top } = newLine.rects[0];

        if (newLine.rects.length > 1) {
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
            Math.abs(line.boundingBox.bottom - newLine.boundingBox.bottom) <= 1
        );

        if (existingLine) {
          const extendedRangeIndex = existingLine.computedContent.findLastIndex(
            (content) => typeof content !== "string"
          );
          const extendedRange = (
            existingLine.computedContent[extendedRangeIndex] as
              | Range
              | undefined
          )?.cloneRange();

          extendedRange?.setEnd(range.endContainer, range.endOffset);

          if (
            extendedRange?.toString() ===
            existingLine.textContent + range.toString()
          ) {
            existingLine.computedContent[extendedRangeIndex] = extendedRange;
          } else {
            existingLine.computedContent.push(range);
          }

          existingLine.scanRects();
        } else {
          lines.push(newLine);
        }

        // Move to next position
        start = range.endOffset;
      }
    });

    // Sort lines by vertical position
    return lines.sort((a, b) => a.boundingBox.top - b.boundingBox.top);
  }
}
