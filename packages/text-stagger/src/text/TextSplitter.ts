import type { ScanEvent } from "text-element-lines";
import {
	AnimationKind,
	type ElementAnimation,
	type ElementOptions,
} from "../stagger/index.js";
import { mergeObject } from "../utils/mergeObject.js";
import type { Ranges } from "./Ranges.js";
import { Text } from "./Text.js";

export type TextLike = Text | Ranges<any, any> | string;

export type SplitterImpl<T extends ElementOptions> = T & {
	splitText(text: Text, event: ScanEvent): ParsedTextSplit[];
	animation: ElementAnimation;
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

export type TextSplitElement =
	| TextSplitElementOffset
	| TextSplitElementString
	| string;

export interface ParsedTextSplit
	extends TextSplitElementOffset,
		TextSplitElementString {
	animation: ElementAnimation;
}

export type TextSplitter<T extends ElementOptions = ElementOptions> =
	| TextSplit
	| `${TextSplit}`
	| (Omit<T, "animation" | "splitText"> & TextSplitterOptions)
	| CustomTextSplitter<T>
	| SplitterImpl<ElementOptions>;

export type CustomTextSplitter<T extends ElementOptions> = (context: {
	text: Text;
	event: ScanEvent;
	options: SplitterImpl<ElementOptions>;

	splitText(
		splitter: RegExp | string,
		splitOptions?: SplitOptions,
	): ParsedTextSplit[];
}) => TextSplitter<T> | TextSplitElement[];

export enum TextSplit {
	Character = "character",
	Word = "word",
	Line = "line",
	Sentence = "sentence",
	Paragraph = "paragraph",
}

const DEFAULT_TEXT_SPLIT = TextSplit.Line;

const CHARACTER_REGEX = /(?!\s)(?=.)/g;
const WORD_REGEX = /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]|\s+/gm;
const LINE_REGEX = /\r\n|\r|\n/g;
const SENTENCE_REGEX = /\r\n/g;
const PARAGRAPH_REGEX = /\n\s*\n/g;

function splitCharacters(this: SplitterImpl<ElementOptions>, text: TextLike) {
	return splitText(text, CHARACTER_REGEX, this);
}

splitCharacters.toString = () => TextSplit.Character;

function splitWords(this: SplitterImpl<ElementOptions>, text: TextLike) {
	return splitText(text, WORD_REGEX, this);
}

splitWords.toString = () => TextSplit.Word;

function splitLines(this: SplitterImpl<ElementOptions>, text: TextLike) {
	return splitText(text, LINE_REGEX, this);
}

splitLines.toString = () => TextSplit.Line;

function splitSentences(this: SplitterImpl<ElementOptions>, text: TextLike) {
	return splitText(text, SENTENCE_REGEX, this);
}

splitSentences.toString = () => TextSplit.Sentence;

function splitParagraphs(this: SplitterImpl<ElementOptions>, text: TextLike) {
	return splitText(text, PARAGRAPH_REGEX, this);
}

splitParagraphs.toString = () => TextSplit.Paragraph;

export function getTextSplit<T extends ElementOptions>(
	textSplit: TextSplit | `${TextSplit}`,
	currentOptions?: T,
): SplitterImpl<T> {
	const animation = [TextSplit.Character, TextSplit.Word].includes(
		textSplit as TextSplit,
	)
		? AnimationKind.FadeIn
		: AnimationKind.GradientReveal;

	const splitText = {
		[TextSplit.Character]: splitCharacters,
		[TextSplit.Word]: splitWords,
		[TextSplit.Line]: splitLines,
		[TextSplit.Sentence]: splitSentences,
		[TextSplit.Paragraph]: splitParagraphs,
	}[textSplit];

	if (!splitText) {
		throw new Error(`Invalid text split: ${textSplit}`);
	}

	return {
		...mergeObject(currentOptions, { animation }),
		splitText,
	};
}

export function mergeTextSplitter<T extends TextSplitterOptions>(
	currentSplitter: SplitterImpl<T>,
	mergeSplitter: TextSplitter<T | ElementOptions>,
): SplitterImpl<T> {
	if (typeof mergeSplitter === "function") {
		const customSplitter = mergeSplitter;

		function customTextSplitter(
			this: SplitterImpl<T>,
			text: Text,
			event: ScanEvent,
		) {
			const result = customSplitter({
				text,
				event,
				options: this,
				splitText: (splitter, splitOptions) => {
					return splitText(text, splitter, mergeObject(this, splitOptions));
				},
			});

			if (!Array.isArray(result)) {
				const mergedSplitter = mergeTextSplitter(currentSplitter, result);

				return mergedSplitter.splitText(text, event);
			}

			const textSplitObjects = result
				.map((split) => {
					const { splitText: _, ...options } = this;

					return mergeObject(
						options,
						typeof split === "string" ? { text: split } : split,
					);
				})
				.filter((element) => isTextSplitOffset(element) || element.text.trim());

			let end = 0;

			return textSplitObjects.map((textSplit, i): ParsedTextSplit => {
				const nextSplit = textSplitObjects[i + 1];
				let start = end;

				if (isTextSplitOffset(textSplit)) {
					({ start, end } = textSplit);
				} else if (isTextSplitOffset(nextSplit)) {
					end = nextSplit.start;
				} else if (i === textSplitObjects.length - 1) {
					end = text.innerText.length;
				} else {
					end = start + textSplit.text.length;

					if (typeof nextSplit?.text === "string") {
						let searchString = "";
						let searchStringStart: number | undefined;

						for (const offset of text.childNodesOffsets) {
							if (offset.end <= end) {
								continue;
							}

							searchStringStart ??= offset.start;
							searchString += offset.childNode.toString();

							const searchStart = Math.max(0, end - searchStringStart);
							const index = searchString.indexOf(nextSplit.text, searchStart);

							if (index !== -1) {
								end = searchStringStart + index;
								break;
							}
						}
					}
				}

				return {
					...textSplit,
					start,
					end,
					text: text.innerText.slice(start, end),
				};
			});
		}

		return {
			...currentSplitter,
			animation: AnimationKind.FadeIn,
			splitText: customTextSplitter,
		};
	}

	if (typeof mergeSplitter === "object") {
		if ("splitText" in mergeSplitter) {
			return mergeObject(currentSplitter, mergeSplitter);
		}

		const { splitter: textSplitter, ...splitterOptions } = mergeSplitter;

		if (textSplitter) {
			currentSplitter = mergeTextSplitter(
				currentSplitter,
				textSplitter,
			) as SplitterImpl<T>;
		}

		let { splitText, ...options } = currentSplitter;
		options = mergeObject(options, splitterOptions);
		return { ...options, splitText } as SplitterImpl<T>;
	}

	const { splitText: _, ...options } = currentSplitter;
	return getTextSplit(mergeSplitter, options) as SplitterImpl<T>;
}

export function resolveTextSplitter<T extends ElementOptions>(
	textSplitter: TextSplitter<T> | undefined | null,
	...textSplitters: (TextSplitter<T | ElementOptions> | undefined | null)[]
) {
	return [textSplitter, ...textSplitters]
		.filter((splitter) => !!splitter)
		.reduce<SplitterImpl<T>>(
			(currentSplitter, newSplitter) =>
				mergeTextSplitter(currentSplitter, newSplitter),
			getTextSplit(DEFAULT_TEXT_SPLIT),
		);
}

export interface SplitOptions extends ElementOptions {
	/**
	 * When true, delimiters will be separate matches rather then extending the matches near them
	 * @default false
	 */
	separateDelimiters?: boolean;
}

export function splitText(
	textLike: TextLike,
	splitter: RegExp | string,
	splitOptions: SplitOptions,
): ParsedTextSplit[] {
	if (!splitOptions || typeof splitOptions !== "object") {
		throw new Error(
			"[splitText] Please pass down the options from the context argument",
		);
	}

	const {
		separateDelimiters,
		animation = AnimationKind.FadeIn,
		...options
	} = splitOptions as SplitOptions & { animation?: AnimationKind };

	if (typeof textLike !== "string") {
		const fullSplits = splitText(textLike.innerText, splitter, splitOptions);

		if (!(textLike instanceof Text)) {
			return fullSplits;
		}

		const continuousSplits: ParsedTextSplit[] = [];

		const [continuousNode, secondContinuousNode] =
			textLike.continuousChildNodes;

		if (continuousNode?.subtext && !secondContinuousNode) {
			const text = continuousNode.nodes.join("");
			const split: ParsedTextSplit = {
				text: text,
				start: 0,
				end: text.length,
				animation,
				...options,
			};

			return [split];
		}

		for (const {
			nodes,
			start,
			end,
			subtext,
		} of textLike.continuousChildNodesOffsets) {
			const text = nodes.map(({ childNode }) => childNode.toString()).join("");
			let lastEnd = continuousSplits.at(-1)?.end ?? 0;
			let splits = fullSplits.filter((split) => {
				return split.end > start && split.start < end;
			});

			const [split, nextSplit] = splits;

			if (!split) {
				continue;
			}

			if (subtext && nextSplit) {
				splits = splitText(text.slice(lastEnd - start), splitter, splitOptions);
			}

			for (const split of splits) {
				if (continuousSplits.includes(split)) {
					continue;
				}

				split.end = split.end - split.start + lastEnd;
				split.start = lastEnd;

				lastEnd = split.end;

				continuousSplits.push(split);
			}
		}

		return continuousSplits;
	}

	const text = textLike;

	const splits: ParsedTextSplit[] = [];
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

		const regex = splitter.flags.includes("g")
			? splitter
			: new RegExp(splitter.source, `${splitter.flags}g`);
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
			const segment = text.slice(lastIndex, end);

			if (!segment.trim()) {
				if (splits.length > 0) {
					const previousSplit = splits[splits.length - 1];
					if (previousSplit) {
						previousSplit.end = end;
						previousSplit.text = text.slice(previousSplit.start, end);
					}
				}
			} else {
				splits.push({
					...options,
					animation,
					start: lastIndex,
					end,
					text: segment,
				});
			}
		}

		if (separateDelimiters) {
			splits.push({
				...options,
				animation,
				start: match.index,
				end: matchEndIndex,
				text: match[0],
			});
		}

		lastIndex = matchEndIndex;
	}

	if (lastIndex < text.length) {
		splits.push({
			...options,
			animation,
			start: lastIndex,
			end: text.length,
			text: text.slice(lastIndex),
		});
	}

	return splits;
}

function isTextSplitOffset(
	textSplitOffset: any,
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
