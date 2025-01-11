import {
  StaggerElementBox,
  StaggerElementBoxOptions,
  StaggerElement,
  SerializedStaggerElement,
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
import {
  CanvasMaskRenderMode,
  doPaint,
  maskRenderMode,
  updateProperty,
} from "./canvas/index.js";

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
  classNamePrefix: string;
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

  /**
   * The class name prefix for the text
   * @default "text-stagger"
   */
  classNamePrefix?: string;
}

export class Text extends Ranges<StaggerElementBox> {
  #mutationCache = new WeakMap<Node, number>();

  lines: TextLine[] = [];
  elements: StaggerElement[] = [];

  canvas?: HTMLCanvasElement;
  canvasContext?: PaintRenderingContext2D | null;

  readonly className: string;

  private constructor(
    public stagger: Stagger,
    public id: number,
    element: HTMLElement,
    public override options: ParsedTextOptions
  ) {
    super(stagger, options);

    const className = this.options.classNamePrefix + "-" + id;

    element.className = this.className = className;
    element.setAttribute("href", "https://github.com/samdenty/react-ai-flow");

    if (this.visualDebug) {
      this.canvas = document.createElement("canvas");
      this.canvas.style.position = "absolute";
      this.canvas.style.width = "100%";
      this.canvas.style.height = "100%";
      this.canvas.style.pointerEvents = "none";
      element.prepend(this.canvas);

      updateProperty(className, "mask-image", null);
      updateProperty(className, "position", "relative");
    } else if (maskRenderMode === CanvasMaskRenderMode.DataUri) {
      this.canvas = document.createElement("canvas");
      updateProperty(className, "will-change", "mask-image");
    } else if (maskRenderMode === CanvasMaskRenderMode.MozElement) {
      this.canvas = document.createElement("canvas");
      this.canvas.style.display = "none";
      this.canvas.id = this.className;
      document.head.prepend(this.canvas);

      updateProperty(className, "mask-image", `-moz-element(#${className})`);
    } else if (maskRenderMode === CanvasMaskRenderMode.WebkitCanvas) {
      updateProperty(className, "mask-image", `-webkit-canvas(${className})`);
    }
  }

  get visualDebug() {
    return this.options.visualDebug;
  }

  get top() {
    return this.relativeTo?.rect.top ?? 0;
  }

  get left() {
    return this.relativeTo?.rect.left ?? 0;
  }

  get width() {
    return this.relativeTo?.rect.width ?? 0;
  }

  get height() {
    return this.relativeTo?.rect.height ?? 0;
  }

  paint() {
    if (
      !this.visualDebug &&
      maskRenderMode === CanvasMaskRenderMode.PaintWorklet
    ) {
      updateProperty(
        this.className,
        "mask-image",
        `paint(text-stagger, ${JSON.stringify(JSON.stringify(this))})`
      );
    }

    this.canvasContext ??= this.canvas?.getContext("2d", {
      willReadFrequently: true,
      alpha: true,
    });

    if (this.canvasContext) {
      doPaint(this.canvasContext, this);
    }

    if (
      this.canvas &&
      !this.visualDebug &&
      maskRenderMode === CanvasMaskRenderMode.DataUri
    ) {
      updateProperty(
        this.className,
        "mask-image",
        `url(${this.canvas.toDataURL("image/png", 0)})`
      );
    }
  }

  toJSON() {
    return {
      width: this.width,
      height: this.height,
      elements: this.elements as SerializedStaggerElement[],
      visualDebug: this.visualDebug,
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
          element.progress = 0;
          element.childNodes = ranges;
        }

        return true;
      }
    );

    const elements: StaggerElement[] = [];

    const trimRanges = this.createChildNodeTrimmer();

    console.group("diff");
    console.log(
      this.relativeTo?.element.innerHTML,
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

    text.scanElementLines(element, {
      reason: ScanReason.Mounted,
    });

    return text;
  }

  scanElementLines(
    element: HTMLElement,
    event: ScanEvent = { reason: ScanReason.Force }
  ) {
    if (event.reason === ScanReason.Mutation) {
      const impacts = this.analyzeMutationImpact(event.entries);

      if (impacts.requiresFullRescan) {
        this.lines = [];
      } else {
        this.lines = this.lines.slice(0, impacts.firstAffectedLine);
      }
    }

    const rect = element.getBoundingClientRect();
    const oldRect = this.relativeTo?.rect;

    this.relativeTo = { element, rect };

    if (
      !oldRect ||
      oldRect.width !== this.width ||
      oldRect.height !== this.height
    ) {
      if (this.canvas) {
        this.canvas.width = this.width;
        this.canvas.height = this.height;
      }

      if (
        !this.visualDebug &&
        maskRenderMode === CanvasMaskRenderMode.WebkitCanvas
      ) {
        this.canvasContext = document.getCSSCanvasContext?.(
          "2d",
          this.className,
          this.width,
          this.height
        );
      }
    }

    this.lines = TextLine.scanLines(element, this);
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

export type SerializedText = ReturnType<Text["toJSON"]>;
