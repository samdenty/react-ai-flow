import {
  ElementAnimation,
  ElementOptions,
  StaggerElement,
} from "../stagger/index.js";
import { Text } from "./Text.js";

export type SplitterImpl<T extends ElementOptions> = Omit<T, "splitter"> & {
  splitter: CustomTextSplitter;
  animation: ElementAnimation;
};

export type OptionalSplitterImpl<T extends ElementOptions> = Omit<
  T,
  "splitter"
> & {
  splitter?: CustomTextSplitter;
};

export interface TextSplitterOptions extends ElementOptions {
  splitter?: Exclude<TextSplitter, TextSplitterOptions>;
}

export interface TextSplitElementOffset extends ElementOptions {
  start: number;
  end: number;
}

export interface TextSplitElementString extends ElementOptions {
  text: string;
}

export type TextSplitElement = TextSplitElementOffset | TextSplitElementString;

export type TextSplitter =
  | TextSplit
  | `${TextSplit}`
  | TextSplitterOptions
  | CustomTextSplitter;

export type CustomTextSplitter = (
  computedTextContent: string,
  text: Text
) =>
  | TextSplitter
  | (string | TextSplitElementOffset | TextSplitElementString)[];

export const enum TextSplit {
  Character = "character",
  Word = "word",
  Line = "line",
  Sentence = "sentence",
  Paragraph = "paragraph",
}

export const DEFAULT_TEXT_SPLIT = TextSplit.Line;

export function getTextSplit<T extends ElementOptions>(
  textSplit: TextSplit | `${TextSplit}`,
  currentOptions?: T
): SplitterImpl<T> {
  const animation = [TextSplit.Character, TextSplit.Word].includes(
    textSplit as TextSplit
  )
    ? ElementAnimation.FadeIn
    : ElementAnimation.GradientReveal;

  const splitter = {
    [TextSplit.Character]: (text: string) =>
      splitTextToElements(text, /(?!\s)(?=.)/),
    [TextSplit.Word]: (text: string) => splitTextToElements(text, /\s+/),
    [TextSplit.Line]: (text: string) => splitTextToElements(text, /\r\n|\r|\n/),
    [TextSplit.Sentence]: (text: string) =>
      splitTextToElements(text, /(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\.|\?)\s/),
    [TextSplit.Paragraph]: (text: string) =>
      splitTextToElements(text, /\n\s*\n/),
  }[textSplit];

  if (!splitter) {
    throw new Error(`Invalid text split: ${textSplit}`);
  }

  return {
    ...StaggerElement.mergeOptions({ animation }, currentOptions),
    splitter,
  };
}

export function mergeTextSplitter<T extends TextSplitterOptions>(
  currentSplitter: SplitterImpl<T>,
  splitter: TextSplitter
): SplitterImpl<T>;
export function mergeTextSplitter<T extends TextSplitterOptions>(
  currentSplitter: OptionalSplitterImpl<T>,
  splitter: TextSplitter
): OptionalSplitterImpl<T>;
export function mergeTextSplitter<T extends TextSplitterOptions>(
  { splitter, ...options }: OptionalSplitterImpl<T>,
  mergeSplitter: TextSplitter
): OptionalSplitterImpl<T> {
  if (typeof mergeSplitter === "function") {
    return {
      ...options,
      animation: ElementAnimation.FadeIn,
      splitter: mergeSplitter,
    } as OptionalSplitterImpl<T>;
  }

  if (typeof mergeSplitter === "object") {
    let { splitter: textSplitter, ...splitterOptions } = mergeSplitter;

    let splitTextOptions: ElementOptions | undefined;
    if (textSplitter) {
      ({ splitter, ...splitTextOptions } = mergeTextSplitter(
        { splitter },
        textSplitter
      ));
    }

    options = [splitTextOptions, splitterOptions].reduce<typeof options>(
      StaggerElement.mergeOptions,
      options
    );

    return { ...options, splitter } as OptionalSplitterImpl<T>;
  }

  return getTextSplit(mergeSplitter, options as T);
}

export function getTextSplitterWithDefaults<T extends ElementOptions>(
  ...textSplitters: (TextSplitter | undefined | null)[]
) {
  return textSplitters
    .filter((splitter) => !!splitter)
    .reduce<SplitterImpl<T>>(
      (currentSplitter, newSplitter) =>
        mergeTextSplitter(currentSplitter, newSplitter),
      getTextSplit(DEFAULT_TEXT_SPLIT)
    );
}

export interface SplitOptions extends ElementOptions {
  /**
   * When true, delimiters will be separate matches rather then extending the matches near them
   * @default false
   */
  separateDelimiters?: boolean;
}

export interface SplitTextElementResult extends TextSplitElementOffset {
  text: string;
}

export function splitTextToElements(
  text: string,
  splitter: RegExp | string,
  options: SplitOptions = {}
): SplitTextElementResult[] {
  const { separateDelimiters } = options;
  const result: SplitTextElementResult[] = [];
  let lastIndex = 0;

  function getNextMatch() {
    if (lastIndex === text.length) {
      return null;
    }

    if (typeof splitter === "string") {
      if (splitter === "") {
        return { index: lastIndex, 0: text.slice(lastIndex, lastIndex + 1) };
      }

      const index = text.indexOf(splitter, lastIndex);
      return index === -1 ? null : { index, 0: splitter };
    }

    const regex = new RegExp(
      splitter.source,
      splitter.flags.includes("g") ? splitter.flags : splitter.flags + "g"
    );
    regex.lastIndex = lastIndex;
    const match = regex.exec(text);

    // If it's a zero-width match, we need to find the next match position
    if (match && match[0] === "") {
      regex.lastIndex = match.index + 1;
      const nextMatch = regex.exec(text);
      return { ...match, endIndex: nextMatch ? nextMatch.index : text.length };
    }

    return match;
  }

  let match: ReturnType<typeof getNextMatch>;

  while ((match = getNextMatch())) {
    const matchEndIndex =
      "endIndex" in match ? match.endIndex : match.index + match[0].length;

    const end = separateDelimiters ? match.index : matchEndIndex;

    if (end > lastIndex) {
      result.push({ start: lastIndex, end, text: text.slice(lastIndex, end) });
    }

    if (separateDelimiters) {
      result.push({
        start: match.index,
        end: matchEndIndex,
        text: match[0],
      });
    }

    lastIndex = matchEndIndex;
  }

  if (lastIndex < text.length) {
    result.push({
      start: lastIndex,
      end: text.length,
      text: text.slice(lastIndex),
    });
  }

  return result;
}

export function isTextSplitOffset(
  textSplitOffset: any
): textSplitOffset is TextSplitElementOffset {
  return (
    textSplitOffset &&
    typeof textSplitOffset === "object" &&
    "start" in textSplitOffset &&
    "end" in textSplitOffset &&
    typeof textSplitOffset.start === "number" &&
    typeof textSplitOffset.end === "number"
  );
}
