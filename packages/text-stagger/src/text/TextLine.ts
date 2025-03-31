import { type ElementOptions, PauseFlags } from "../stagger/index.js";
import { Box, Ranges } from "./Ranges.js";
import type { Text } from "./Text.js";
import { createTextLine, preserveOptimizeRects } from "textlines";

const BaseTextLine = createTextLine(Ranges);

export class TextLine extends BaseTextLine {
	pause() {
		this.stagger.pause(this);
	}

	play() {
		this.stagger.play(this);
	}

	get paused(): boolean {
		const state = this.stagger.getPauseState(this);
		return state.flags !== PauseFlags.None;
	}

	get pauseTime(): number | null {
		const state = this.stagger.getPauseState(this);
		return state.time;
	}

	get pausedBy() {
		const state = this.stagger.getPauseState(this);
		return state.items;
	}

	get elements() {
		return this.text.elements.filter((element) => {
			return this.start < element.end && element.start <= this.end;
		});
	}

	// Add ID property specific to text-stagger
	id: string;

	constructor(
		public override text: Text,
		index: number,
		blockParent: HTMLElement,
		startOfBlock: boolean,
		endOfBlock: boolean,
		ranges: Range[],
		options: ElementOptions = {},
	) {
		super(text, options, index, blockParent, startOfBlock, endOfBlock, ranges);
		this.id = `${this.text.id}:${index}`;
	}

	override scanBoxes(rects: DOMRect[][]) {
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

	static getLines<T extends Ranges<any, any>>(
		range: T,
		position?: { start?: number; end?: number },
	): T extends { lines: TextLine[] } ? TextLine[] : null {
		if (
			!("lines" in range) ||
			!Array.isArray(range.lines) ||
			!range.lines.every((line) => line instanceof TextLine)
		) {
			return null as T extends { lines: TextLine[] } ? never : null;
		}

		return range.lines.filter((line) => {
			const start = position?.start ?? line.start;
			const end = position?.end ?? line.end;

			return start < line.end && line.start <= end;
		}) as T extends { lines: TextLine[] } ? TextLine[] : never;
	}

	comparePosition(other: this): number {
		if (this.text !== other.text) {
			return super.comparePosition(other);
		}

		return this.index - other.index;
	}
}
