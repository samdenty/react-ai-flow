import { preserveOptimizeRects } from "text-element-lines";
import {
	Box,
	Ranges,
	type SplitterImpl,
	type Text,
	TextLine,
} from "../text/index.js";
import { cloneRangeWithStyles } from "../text/styles/cloneRangeStyles.js";
import { getCustomAnimationStyles } from "../text/styles/customAnimationStyles.js";
import {
	AnimationTiming,
	AnimationKind,
	type ElementOptions,
	type StaggerElement,
	isGradient,
	timingFunctions,
} from "./StaggerElement.js";

export interface StaggerElementBoxOptions
	extends SplitterImpl<ElementOptions> {}

let ID = 0;

export class StaggerElementBox extends Ranges<
	Box<StaggerElementBox>,
	StaggerElement
> {
	static DEFAULT_GRADIENT_WIDTH = 100;

	#lines = new WeakMap<TextLine[], TextLine[]>();
	#progress = 0;

	id = ++ID;
	className: string;

	customAnimationElement?: HTMLElement;
	initialStyle?: string;

	start: number;
	end: number;

	#rect?: DOMRect;

	constructor(
		parent: StaggerElement,
		ranges: Range[],
		position: { start: number; end: number },
		public subtext: Text | null,
		rect: DOMRect,
	) {
		super(parent, parent.options, parent.container);

		this.#rect = rect;
		this.childNodes = ranges;

		this.start = position.start;
		this.end = position.end;

		this.className = `${this.text.options.classNamePrefix}-box-${this.id}`;
	}

	dispose() {
		super.dispose();

		this.customAnimationElement?.remove();

		if (this.subtext?.closestCommonParent && this.initialStyle != null) {
			this.subtext.updateProperty(
				"style",
				this.initialStyle,
				this.subtext.closestCommonParent,
			);
		}
	}

	scanRanges() {
		const rect = this.#rect;

		if (rect) {
			this.#rect = undefined;
			return [[rect]];
		}

		return super.scanRanges();
	}

	scanBounds(
		rects: { top: number; left: number; bottom: number; right: number }[][],
	) {
		if (this.subtext) {
			if (this.text.parentText) {
				return Box.getBounds([this.text]);
			}

			return Box.getBounds([this.subtext]);
		}

		return super.scanBounds(rects);
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

	get element() {
		return this.parent;
	}

	get progress() {
		return this.#progress;
	}

	timingFunction(progress: number) {
		const animationTiming =
			this.options.animationTiming ??
			(this.element.animation === AnimationKind.FadeIn
				? AnimationTiming.Linear
				: AnimationTiming.EaseInOut);

		const resolvedTiming =
			typeof animationTiming === "function"
				? animationTiming(this)
				: animationTiming;

		const timing =
			typeof resolvedTiming === "number"
				? resolvedTiming
				: timingFunctions[resolvedTiming](progress);

		return timing;
	}

	get timing() {
		return this.timingFunction(this.progress);
	}

	set progress(progress: number) {
		// if someone accidentally passes NaN
		progress ||= 0;

		const changed = progress !== this.progress;

		if (!changed) {
			return;
		}

		this.#progress = progress;

		this.updateCustomAnimation();

		this.stagger.requestAnimation([this.text]);
	}

	updateCustomAnimation() {
		const styles = getCustomAnimationStyles(this);
		const batchedStyles: string[] = [];

		if (this.subtext?.closestCommonParent) {
			this.initialStyle ??=
				this.subtext.closestCommonParent.style.cssText || "";

			if (styles) {
				for (const [key, value] of Object.entries(styles)) {
					if (value != null) {
						batchedStyles.push(`${key}: ${value}`);
					}
				}
			}

			this.subtext.updateProperty(
				"style",
				this.initialStyle + batchedStyles.join(";"),
				this.subtext.closestCommonParent,
			);

			return;
		}

		if (!styles) {
			this.customAnimationElement?.remove();
			this.customAnimationElement = undefined;

			if (!this.text.customAnimation.childNodes.length) {
				this.text.customAnimationContainer.remove();
			}

			return;
		}

		if (!this.customAnimationElement) {
			this.customAnimationElement = this.text.createIgnoredElement("div", true);
			this.customAnimationElement.className = this.className;

			this.text.insertCustomAnimationContainer();
			this.text.customAnimation.append(this.customAnimationElement);

			for (const range of this.ranges) {
				cloneRangeWithStyles(
					this.window,
					range,
					this.customAnimationElement,
					(element) => {
						if (!this.text.visualDebug) {
							element.style.pointerEvents = "none";
						}

						this.text.ignoreNextMutation();
					},
				);
			}

			if (this.customAnimationElement.style.display === "list-item") {
				this.customAnimationElement.style.display = "";
			}

			this.initialStyle = undefined;
		}

		this.initialStyle ??= this.customAnimationElement.style.cssText || "";

		batchedStyles.push("box-sizing: content-box");
		batchedStyles.push(`line-height: ${this.height}px`);
		batchedStyles.push(`height: ${this.height}px`);
		batchedStyles.push(`width: ${this.width}px`);

		if (this.text.visualDebug) {
			batchedStyles.push("padding: 0");
			batchedStyles.push("margin: 0");
		} else {
			batchedStyles.push(`padding: ${this.height}px ${this.width}px`);
			batchedStyles.push(`margin: -${this.height}px -${this.width}px`);
		}

		for (const [key, value] of Object.entries(styles)) {
			if (value != null) {
				batchedStyles.push(`${key}: ${value}`);
			}
		}

		if (this.text.visualDebug) {
			batchedStyles.push("background: rgba(0, 255, 0, 0.6)");
		}

		batchedStyles.push("position: absolute");
		batchedStyles.push(`top: ${this.top - this.text.top}px`);
		batchedStyles.push(`left: ${this.left - this.text.left}px`);

		this.text.ignoreNextMutation();
		this.text.updateProperty(
			"style",
			this.initialStyle + batchedStyles.join(";"),
			this.customAnimationElement,
		);
	}

	get text() {
		return this.element.text;
	}

	get lines(): TextLine[] {
		const cached = this.#lines.get(this.text.lines);

		if (cached) {
			return cached;
		}

		const lines = TextLine.getLines(this.text, this);

		this.#lines.set(this.text.lines, lines);

		return lines;
	}

	get isLast() {
		return this.element.uniqueBoxes.at(-1) === this;
	}

	get isGradient() {
		return isGradient(this.element.animation);
	}

	comparePosition(other: this) {
		if (this.text !== other.text) {
			return super.comparePosition(other);
		}

		const pos = this.element.comparePosition(other.element);

		if (pos) {
			return pos;
		}

		return super.comparePosition(other);
	}

	get gradientWidth() {
		let cssLiteral = this.options.gradientWidth;

		if (
			!this.isGradient ||
			cssLiteral == null ||
			this.timing === 0 ||
			this.timing === 1
		) {
			return StaggerElementBox.DEFAULT_GRADIENT_WIDTH;
		}

		if (typeof cssLiteral === "function") {
			cssLiteral = cssLiteral(this);

			if (cssLiteral == null) {
				return StaggerElementBox.DEFAULT_GRADIENT_WIDTH;
			}
		}

		return this.text.convertToPx(cssLiteral, this);
	}

	get relativeToText() {
		return this.relativeTo(this.text);
	}

	get relativeToCanvas() {
		const { left, top, right, bottom, width, height } = this.relativeToText;
		const marginLeft = this.text.left - this.text.canvasRect.left;

		return {
			left: left + marginLeft,
			right: right + marginLeft,
			top,
			bottom,
			width,
			height,
		};
	}

	toJSON() {
		return {
			relativeToCanvas: this.relativeToCanvas,
			progress: this.progress,
			timing: this.timing,
			gradientWidth: this.gradientWidth,
			subtext: this.subtext,
			text: {
				parentText: this.text.parentText && {
					id: this.text.parentText.id,
				},
			},
			isLast: this.isLast,
		};
	}
}

export type SerializedStaggerElementBox = ReturnType<
	StaggerElementBox["toJSON"]
>;
