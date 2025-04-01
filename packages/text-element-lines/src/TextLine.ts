import { Box } from "./Box.js";
import { Ranges, type RangesChildNode } from "./Ranges.js";
import type { TextLines } from "./TextLines.js";
import { mergeObject } from "./utils/mergeObject.js";
import { preserveOptimizeRects } from "./utils/optimizeRects.js";

export interface TextLine extends Ranges<Box<ThisType<TextLine>>, TextLines> {
	startOfText: boolean;
	endOfBlock: boolean;
	endOfText: boolean;
	start: number;
	end: number;
	index: number;
	blockParent: HTMLElement;
	startOfBlock: boolean;
	text: TextLines;
	options: object;

	scanBoxes(rects: DOMRect[][]): Box[][];
	comparePosition(other: TextLine): number;
}

const constructors: any[] = [];

// Create the TextLine factory function
export function createTextLine<T>(
	RangesBase: abstract new (...args: any[]) => T,
): new (
	text: TextLines<any, any>,
	options: object,
	blockParent: HTMLElement,
	startOfBlock: boolean,
	endOfBlock: boolean,
	ranges: Range[],
) => TextLine & T {
	const Base = RangesBase as any as typeof Ranges;

	class TextLine
		extends Base<Box<ThisType<TextLine>>, TextLines>
		implements TextLine
	{
		static [Symbol.hasInstance](value: any) {
			return constructors.some((TextLine) =>
				Function.prototype[Symbol.hasInstance].call(TextLine, value),
			);
		}

		startOfText = false;
		#endOfBlock = false;
		#endOfText = false;

		get endOfBlock() {
			return this.#endOfBlock;
		}

		set endOfBlock(endOfBlock: boolean) {
			if (this.#endOfBlock === endOfBlock) {
				return;
			}

			this.#endOfBlock = endOfBlock;
			this.childNodes = [...this.childNodes];
		}

		get endOfText() {
			return this.#endOfText;
		}

		set endOfText(endOfText: boolean) {
			if (this.#endOfText === endOfText) {
				return;
			}

			this.#endOfText = endOfText;
			this.childNodes = [...this.childNodes];
		}

		override set childNodes(childNodes: RangesChildNode[]) {
			childNodes = childNodes.filter(
				(childNode) => typeof childNode !== "string",
			);

			if (!this.endOfText) {
				const ending = this.endOfBlock ? "\r\n" : "\n";

				if (!childNodes.join("").endsWith(ending)) {
					childNodes.push(ending);
				}
			}

			super.childNodes = childNodes;
		}

		get childNodes(): readonly RangesChildNode[] {
			return super.childNodes;
		}

		start = 0;
		end = 0;
		index = 0;

		constructor(
			public text: TextLines,
			public options: object,
			public blockParent: HTMLElement,
			public startOfBlock: boolean,
			endOfBlock: boolean,
			ranges: Range[],
		) {
			super(text, mergeObject(text.options, options), text.container);
			this.endOfBlock = endOfBlock;
			this.childNodes = ranges;
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
					rect.height,
				);
			});
		}
	}

	constructors.push(TextLine);

	return TextLine as any;
}

export const TextLine = createTextLine(Ranges);
