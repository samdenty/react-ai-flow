import {
  StaggerElementBox,
  StaggerElementBoxOptions,
  StaggerElement,
} from "../stagger/index.js";
import { Ranges } from "./Ranges.js";
import { Stagger } from "../stagger/Stagger.js";
import { TextLine } from "./TextLine.js";
import {
  getTextSplitterWithDefaults,
  isTextSplitOffset,
  mergeTextSplitter,
  SplitterImpl,
  TextSplitElement,
  TextSplitter,
  TextSplitterOptions,
} from "./TextSplitter.js";

const LAYOUT_AFFECTING_ATTRIBUTES = new Set([
  "style",
  "class",
  "width",
  "height",
  "font",
  "font-size",
  "font-family",
  "line-height",
  "white-space",
  "word-break",
  "word-wrap",
  "text-align",
  "direction",
  "writing-mode",
]);

export interface TextOptions
  extends SplitterImpl<TextSplitterOptions>,
    StaggerElementBoxOptions {}

export class Text extends Ranges<StaggerElementBox> {
  lines: TextLine[];
  #elements?: StaggerElement[];

  #mutationCache = new WeakMap<Node, number>();

  private constructor(
    public stagger: Stagger,
    public id: number,
    element: HTMLElement,
    ranges: Range[],
    public override options: TextOptions
  ) {
    const rect = element.getBoundingClientRect();
    super(stagger, ranges, { element, rect }, options);

    this.lines = TextLine.scanLines(this);
    this.computedContent = this.lines.flatMap((line) => line.computedContent);
  }

  toJSON() {
    return {
      elements: this.elements,
    };
  }

  split(...textSplitters: TextSplitter[]): StaggerElement[] {
    const { splitter, ...options } =
      getTextSplitterWithDefaults<StaggerElementBoxOptions>(
        this.options,
        ...textSplitters
      );

    const result = splitter(this.computedTextContent, this);

    if (Array.isArray(result)) {
      const textSplits: TextSplitElement[] = result
        .map((split) => {
          return StaggerElement.mergeOptions(
            options,
            typeof split === "string" ? { text: split } : split
          );
        })
        .filter((element) => isTextSplitOffset(element) || element.text.trim());

      return StaggerElement.splitsToElements(this, textSplits);
    }

    return this.split(options, result);
  }

  get boxes() {
    return this.elements.flatMap((element) => element.boxes);
  }

  get elements() {
    return (this.#elements ??= this.split());
  }

  static scanText(
    stagger: Stagger,
    id: number,
    element: HTMLElement,
    splitterOptions: TextSplitterOptions
  ) {
    const range = document.createRange();
    range.selectNodeContents(element);

    // Get all text nodes within the element
    const textNodes: globalThis.Text[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);

    while (walker.nextNode()) {
      textNodes.push(walker.currentNode as globalThis.Text);
    }

    const hiddenCache = new WeakMap();

    // Helper function to check if an element is hidden
    function isElementHidden(element: HTMLElement) {
      let hidden = hiddenCache.get(element);

      if (hidden == null) {
        const style = getComputedStyle(element);
        hidden =
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.opacity === "0" ||
          (element.offsetParent === null &&
            element !== document.body &&
            element !== document.documentElement);

        hiddenCache.set(element, hidden);
      }

      return hidden;
    }

    // Helper function to check if any parent is hidden
    function hasHiddenParent(node: Node) {
      let parent = node.parentElement;
      while (parent) {
        if (isElementHidden(parent)) {
          return true;
        }
        parent = parent.parentElement;
      }
      return false;
    }

    const ranges: (Range | undefined)[] = [];

    for (const node of textNodes) {
      let range = ranges[ranges.length - 1];

      if (node.textContent && !hasHiddenParent(node)) {
        if (!range) {
          range = document.createRange();
          ranges.splice(ranges.length - 1, 0, range);
          range.setStart(node, 0);
        }

        range.setEnd(node, node.textContent.length);
      } else if (range) {
        ranges.push(undefined);
      }
    }

    return new Text(
      stagger,
      id,
      element,
      ranges.filter(Boolean) as Range[],
      mergeTextSplitter<TextOptions>(stagger.options, splitterOptions)
    );
  }

  rescan(mutations: MutationRecord[]) {
    // @ts-ignore
    const impacts = this.analyzeMutationImpact(mutations);
    // if (impacts.requiresFullRescan) {
    //   this.lines = Text.scanText(element, this.options);
    // } else if (impacts.firstAffectedLine !== -1) {
    //   this.rescanFromLine(element, impacts.firstAffectedLine);
    // }
  }

  private analyzeMutationImpact(mutations: MutationRecord[]) {
    let requiresFullRescan = false;
    let firstAffectedLine = -1;

    for (const mutation of mutations) {
      switch (mutation.type) {
        // Text content changed
        case "characterData":
          if (mutation.target instanceof Text) {
            const lineIndex = this.findLineContainingNode(mutation.target);
            if (
              lineIndex !== -1 &&
              (firstAffectedLine === -1 || lineIndex < firstAffectedLine)
            ) {
              firstAffectedLine = lineIndex;
            }
          }

          break;

        // Nodes added or removed
        case "childList":
          const addedNodes = Array.from(mutation.addedNodes);
          const removedNodes = Array.from(mutation.removedNodes);

          const affectedNodes = [...addedNodes, ...removedNodes];
          for (const node of affectedNodes) {
            const lineIndex = this.findLineContainingNode(node);
            if (
              lineIndex !== -1 &&
              (firstAffectedLine === -1 || lineIndex < firstAffectedLine)
            ) {
              firstAffectedLine = lineIndex;
            }
          }
          break;

        // Style changes that might affect layout
        case "attributes":
          const element = mutation.target as HTMLElement;
          if (this.doesAttributeAffectLayout(mutation.attributeName!)) {
            const lineIndex = this.findLineContainingNode(element);

            if (lineIndex === -1) {
              requiresFullRescan = true;
            } else {
              firstAffectedLine = lineIndex;
            }
          }
          break;
      }

      if (requiresFullRescan) break;
    }

    return { requiresFullRescan, firstAffectedLine };
  }

  private findLineContainingNode(node: Node): number {
    // First check cache
    const cachedIndex = this.#mutationCache.get(node);
    if (cachedIndex != null) {
      return cachedIndex;
    }

    const index = this.lines.findIndex((line) =>
      line.ranges.some((range) => range.intersectsNode(node))
    );

    this.#mutationCache.set(node, index);

    return index;
  }

  private doesAttributeAffectLayout(attributeName: string): boolean {
    return LAYOUT_AFFECTING_ATTRIBUTES.has(attributeName.toLowerCase());
  }
}
