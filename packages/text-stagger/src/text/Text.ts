import {
  StaggerElementBox,
  StaggerElementBoxOptions,
  StaggerElement,
} from "../stagger/index.js";
import { Ranges } from "./Ranges.js";
import { ScanEvent, ScanReason, Stagger } from "../stagger/Stagger.js";
import { TextLine } from "./TextLine.js";
import {
  mergeTextSplitter,
  ParsedTextSplit,
  SplitterImpl,
  TextSplitterOptions,
} from "./TextSplitter.js";
import { calcSlices } from "fast-myers-diff";

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

export interface ParsedTextOptions
  extends SplitterImpl<TextSplitterOptions>,
    StaggerElementBoxOptions {
  visualDebug: boolean;
  disabled: boolean;
}

export interface TextOptions extends TextSplitterOptions {
  /**
   * Display the canvas direclty instead of using mask-image,
   * useful for debugging
   * @default false
   */
  visualDebug?: boolean;

  /**
   * Disable the text from being animated
   */
  disabled?: boolean;
}
export class Text extends Ranges<StaggerElementBox> {
  lines: TextLine[] = [];
  elements: StaggerElement[] = [];

  #mutationCache = new WeakMap<Node, number>();

  private constructor(
    public stagger: Stagger,
    public id: number,
    element: HTMLElement,
    public override options: ParsedTextOptions
  ) {
    const rect = element.getBoundingClientRect();
    super(stagger, { element, rect }, options);
  }

  toJSON() {
    return {
      elements: this.elements,
    };
  }

  diffElements(
    event: ScanEvent = { reason: ScanReason.Force }
  ): StaggerElement[] {
    const textSplits = this.options.splitText(this, event);

    const diffs = calcSlices(
      this.elements as (StaggerElement | ParsedTextSplit)[],
      textSplits as (StaggerElement | ParsedTextSplit)[],
      (elementIndex, splitIndex) => {
        if (elementIndex === -1 || splitIndex === -1) {
          return false;
        }

        const element = this.elements[elementIndex];
        const textSplit = textSplits[splitIndex];

        if (element.innerText !== textSplit.text) {
          return false;
        }

        if (element.childNodes.join("") !== element.innerText) {
          const ranges = trimRanges(textSplit.start, textSplit.end);
          element.childNodes = ranges;
        }

        return true;
      }
    );

    const elements: StaggerElement[] = [];

    const trimRanges = this.createChildNodeTrimmer();

    console.group("diff");
    console.log(
      this.relativeTo.element.innerHTML,
      this,
      textSplits.map((a) => a.text).join(""),
      event
    );

    for (const [action, items] of diffs) {
      if (action === 0) {
        const existingElements = items as StaggerElement[];
        elements.push(...existingElements);
        continue;
      }

      if (action === -1) {
        for (const element of items as StaggerElement[]) {
          console.log("remove", [element.innerText]);
        }
        continue;
      }

      const splits = items as ParsedTextSplit[];

      console.log(
        "add",
        splits.map((split) => split.text)
      );

      for (const textSplit of splits) {
        const element = new StaggerElement(
          this,
          trimRanges(textSplit.start, textSplit.end),
          textSplit
        );

        elements.push(element);
      }
    }

    console.groupEnd();

    return elements;
  }

  get boxes() {
    return this.elements.flatMap((element) => element.boxes);
  }

  static scanText(
    stagger: Stagger,
    id: number,
    element: HTMLElement,
    textOptions: TextOptions
  ) {
    const text = new Text(
      stagger,
      id,
      element,
      mergeTextSplitter<ParsedTextOptions>(stagger.options, textOptions)
    );

    text.scanElementLines({
      reason: ScanReason.Mounted,
    });

    return text;
  }

  scanElementLines(event: ScanEvent = { reason: ScanReason.Force }) {
    if (event.reason === ScanReason.Mutation) {
      const impacts = this.analyzeMutationImpact(event.entries);

      if (impacts.requiresFullRescan) {
        this.lines = [];
      } else {
        this.lines = this.lines.slice(0, impacts.firstAffectedLine);
      }
    }

    this.relativeTo = {
      element: this.relativeTo.element,
      rect: this.relativeTo.element.getBoundingClientRect(),
    };

    this.lines = TextLine.scanLines(this);
    this.childNodes = this.lines.flatMap((line) => line.childNodes);

    this.elements = this.diffElements(event);
  }

  private analyzeMutationImpact(
    mutations: MutationRecord[]
  ):
    | { requiresFullRescan: true; firstAffectedLine?: undefined }
    | { requiresFullRescan: false; firstAffectedLine: number } {
    let firstAffectedLine = null;

    for (const mutation of mutations) {
      switch (mutation.type) {
        // Text content changed
        case "characterData": {
          if (mutation.target instanceof Text) {
            const lineIndex = this.findLineContainingNode(mutation.target);

            if (lineIndex === -1) {
              return { requiresFullRescan: true };
            }

            firstAffectedLine = Math.min(
              firstAffectedLine ?? lineIndex,
              lineIndex
            );
          }

          break;
        }

        // Nodes added or removed
        case "childList": {
          for (const node of mutation.addedNodes) {
            const lineIndex = this.findLineContainingNode(
              node.previousSibling ?? node.parentElement ?? document.body
            );

            if (lineIndex === -1) {
              return { requiresFullRescan: true };
            }

            firstAffectedLine = Math.min(
              firstAffectedLine ?? lineIndex,
              lineIndex
            );
          }

          break;
        }

        // Style changes that might affect layout
        case "attributes": {
          const element = mutation.target as HTMLElement;

          if (this.doesAttributeAffectLayout(mutation.attributeName!)) {
            const lineIndex = this.findLineContainingNode(element);

            if (lineIndex === -1) {
              return { requiresFullRescan: true };
            }

            firstAffectedLine = Math.min(
              firstAffectedLine ?? lineIndex,
              lineIndex
            );
          }

          break;
        }
      }
    }

    if (firstAffectedLine == null) {
      return { requiresFullRescan: true };
    }

    return { requiresFullRescan: false, firstAffectedLine };
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
