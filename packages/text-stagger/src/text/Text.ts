import { calcSlices } from "fast-myers-diff";
import { PauseFlags, type Stagger } from "../stagger/Stagger.js";
import {
	type ElementOptions,
	type RelativeTimePeriod,
	type SerializedStaggerElement,
	StaggerElement,
	type StaggerElementBoxOptions,
} from "../stagger/index.js";
import { Box, Ranges, type RangesChildNode } from "./Ranges.js";
import { TextLine } from "./TextLine.js";
import type {
	ParsedTextSplit,
	SplitterImpl,
	TextSplitterOptions,
} from "./TextSplitter.js";
import {
	CanvasMaskRenderMode,
	doPaint,
	getRenderingMode,
} from "./canvas/index.js";
import {
	createTextLines,
	ScanReason,
	type ScanEvent,
} from "text-element-lines";

// text-stagger-record overwrites requestAnimationFrame and cancelAnimationFrame
const { requestAnimationFrame } = globalThis;

export interface ParsedTextOptions
	extends SplitterImpl<TextSplitterOptions>,
		StaggerElementBoxOptions {
	visualDebug: boolean;
	id: number;
	maxFps: number | null | ((text: Text) => boolean | number | null);
	vibration:
		| RelativeTimePeriod
		| RelativeTimePeriod[]
		| false
		| ((
				element: StaggerElement,
		  ) => RelativeTimePeriod | RelativeTimePeriod[] | false);
	disabled: boolean;
	classNamePrefix: string;
	delayTrailing: boolean;
	stagger: NonNullable<ElementOptions["stagger"]>;
}

export interface TextOptions extends TextSplitterOptions {
	id?: number;

	/**
	 * Display the canvas direclty instead of using mask-image,
	 * useful for debugging
	 * @default false
	 */
	visualDebug?: boolean;

	/**
	 * Lock the animation to a maximum FPS.
	 *
	 * @default null for no limit
	 */
	maxFps?: number | null | ((text: Text) => boolean | number | null);

	/**
	 * Disable the text from being animated
	 */
	disabled?: boolean;

	/**
	 * The class name prefix for the text
	 * @default "text-stagger"
	 */
	classNamePrefix?: string;

	/**
	 * Delays animating the trailing element until the next element appears,
	 * producing smoother animations by avoiding duplicate updates. When disabled,
	 * the trailing element may flicker as it animates multiple times in response
	 * to streaming updates targeting the same position.
	 *
	 * @requires stagger.streaming hints to be set correctly
	 */
	delayTrailing?: boolean;
}

const BaseTextLines = createTextLines(Ranges);

export class Text extends BaseTextLines<TextLine, Text | Stagger> {
	#maxFps?: number;
	#closestCommonParent?: { rect: DOMRect; element: HTMLElement };

	override uniqueBoxes: Box<Text | Stagger>[] = [];
	override boxes: Box<Text | Stagger>[][] = [];

	updateBoundsOnPaint = false;
	id: number;

	elements: StaggerElement[] = [];
	trailingSplit: ParsedTextSplit | null = null;

	canvas?: HTMLCanvasElement;
	canvasContext?: PaintRenderingContext2D | null;
	canvasRect = new DOMRect();
	#scannedCanvasDimensions?: {
		width: number;
		height: number;
	};
	customAnimationClassName: string;
	customAnimationContainer: HTMLElement;
	lastPaint?: number;

	text = this;

	readonly className: string;

	get parent() {
		return super.parent;
	}

	set parent(parent: Text | Stagger) {
		const existingParent = this.parent;

		if (parent instanceof Text) {
			parent.createIgnoredElement(this.customAnimationContainer);
		}

		super.parent = parent;

		if (parent === existingParent) {
			return;
		}

		this.parentText?.scanElementLines({
			reason: ScanReason.Force,
			reset: true,
		});

		this.scanElementLines({
			reason: ScanReason.Force,
			reset: true,
		});
	}

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

	scanBounds() {
		this.updateStyles(this.className, "padding", "0px");
		this.updateStyles(this.className, "margin", "0px");

		const { top, bottom, left, right, height, width } =
			this.container.getBoundingClientRect();

		let marginLeft = 0;
		let marginRight = 0;

		if (this.parentText) {
			this.updateStyles(this.className, "padding", null);
			this.updateStyles(this.className, "margin", null);
		} else {
			({ left: marginLeft, right: marginRight } = getAvailableSpace(
				this.window,
				this.container,
				{ left, right },
			));

			this.updateStyles(
				this.className,
				"padding",
				`0px ${marginRight}px 0 ${marginLeft}px`,
			);
			this.updateStyles(
				this.className,
				"margin",
				`0px ${-marginRight}px 0 ${-marginLeft}px`,
			);
		}

		this.updateStyles(this.customAnimationClassName, "height", `${height}px`);
		this.updateStyles(this.customAnimationClassName, "width", `${width}px`);

		this.canvasRect = new DOMRect(
			left - marginLeft,
			top,
			width + marginLeft + marginRight,
			height,
		);

		this.#closestCommonParent = undefined;

		return { top, left, bottom, right };
	}

	updateBounds(rects?: [[DOMRect]]) {
		this.updateBoundsOnPaint = false;
		const changed = super.updateBounds(rects);

		if (changed) {
			this.updateCustomAnimationPosition();
		}

		return changed;
	}

	insertCustomAnimationContainer() {
		if (this.text.customAnimationContainer.parentElement) {
			return;
		}

		this.text.container.insertAdjacentElement(
			"afterend",
			this.text.customAnimationContainer,
		);

		this.updateCustomAnimationPosition(true);
	}

	get shouldSkipFrame() {
		const now = Date.now();
		const ms = 1000 / this.maxFps;

		return (
			this.stagger.lastPaint &&
			this.lastPaint &&
			(now - this.stagger.lastPaint < ms || now - this.lastPaint < ms)
		);
	}

	get maxFps() {
		if (this.#maxFps != null) {
			return this.#maxFps;
		}

		requestAnimationFrame(() => {
			this.#maxFps = undefined;
		});

		const maxFps = this.options.maxFps ?? Number.POSITIVE_INFINITY;

		if (typeof maxFps === "number") {
			return (this.#maxFps = maxFps);
		}

		const result = maxFps(this);

		if (typeof result === "number") {
			return (this.#maxFps = result);
		}

		if (result === false) {
			return (this.#maxFps = 0);
		}

		return (this.#maxFps = Number.POSITIVE_INFINITY);
	}

	private updateCustomAnimationPosition(force?: boolean) {
		if (!force && !this.customAnimationContainer.childNodes.length) {
			return;
		}

		const { top, left } = this.customAnimationContainer.getBoundingClientRect();

		if (top === this.top && left === this.left) {
			return;
		}

		const styles = this.window.getComputedStyle(this.customAnimationContainer);

		let offsetTop = Number.parseFloat(styles.marginTop) || 0;
		let offsetLeft = Number.parseFloat(styles.marginLeft) || 0;

		offsetTop -= top - this.top;
		offsetLeft -= left - this.left;

		this.updateStyles(
			this.customAnimationClassName,
			"margin",
			`${offsetTop}px 0px 0px ${offsetLeft}px`,
		);
	}

	scanBoxes(rects: DOMRect[][]) {
		return rects.map((rects) => {
			return rects.map((rect) => {
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
		});
	}

	get elementBoxes() {
		return this.elements.flatMap((element) => element.uniqueBoxes);
	}

	get progress(): number {
		if (!this.elementBoxes.length) {
			return 1;
		}

		return (
			this.elementBoxes.reduce((acc, box) => acc + box.progress, 0) /
			this.elementBoxes.length
		);
	}

	set progress(progress: number) {
		if (!this.elements.length) {
			return;
		}

		const elementCount = this.elements.length;
		const progressPerElement = 1 / elementCount;

		this.elements.forEach((element, i) => {
			const startProgress = i * progressPerElement;

			element.progress = Math.min(
				1,
				Math.max(0, (progress - startProgress) / progressPerElement),
			);
		});
	}

	get container(): HTMLElement & { text?: Text } {
		return super.container;
	}

	set container(container: (HTMLElement & { text?: Text }) | undefined) {
		if (container === super.container) {
			return;
		}

		super.container = container;

		for (let i = this.stagger.texts.length - 1; i >= 0; i--) {
			const text = this.stagger.texts[i]!;

			if (text === this) {
				continue;
			}

			if (!container) {
				if (text.parent === this) {
					text.parent = this.stagger;
				}
				continue;
			}

			if (
				text.parentText?.parents.has(container) ||
				this.parentText?.parents.has(text.container)
			) {
				continue;
			}

			if (text.parents.has(container)) {
				text.parent = this;
			}

			if (this.parents.has(text.container)) {
				this.parent = text;
				break;
			}
		}

		if (!container) {
			this.canvas?.remove();
			this.customAnimationContainer.remove();
			this.container.text = undefined;

			return;
		}

		this.stagger.invalidatePositions();

		this.container.text = this;
		this.container.classList.add("ai-flow", this.className);

		this.updateStyles(this.customAnimationClassName, "position", "relative");

		if (!this.visualDebug) {
			this.updateStyles(
				this.customAnimationClassName,
				"pointer-events",
				"none",
			);
		}

		this.canvas = undefined;

		this.updateStyles(this.className, "position", "relative");

		this.updateBlockDisplay();

		this.updateRenderingMode();
	}

	updateBoundsOnNextFrame() {
		this.updateBoundsOnPaint = true;
	}

	revealTrailing() {
		if (!this.trailingSplit) {
			return;
		}

		const trimChildNodes = this.createChildNodeTrimmer();

		const childNodes = trimChildNodes(
			this.trailingSplit.start,
			this.trailingSplit.end,
		);

		// childNodes can be empty if a mutation has occurred in meantime
		if (childNodes.length) {
			const element = new StaggerElement(this, childNodes, this.trailingSplit);
			element.restartAnimation(false);
			this.stagger.vibrate();
		}

		this.trailingSplit = null;

		this.stagger.requestAnimation([this]);
	}

	constructor(
		parent: Stagger | Text,
		public options: ParsedTextOptions,
	) {
		super(parent, undefined!);

		this.id = options.id;
		this.className = `${options.classNamePrefix}-text-${this.id}`;

		this.customAnimationClassName = `${options.classNamePrefix}-custom-${this.id}`;
		this.customAnimationContainer = this.createIgnoredElement("div");
		this.customAnimationContainer.className = this.customAnimationClassName;

		this.updateStyles(this.className, null);
		this.updateStyles(this.customAnimationClassName, null);

		// hide until first render, but don't set to zero otherwise it
		// won't be scanned by the layout engine
		this.updateStyles(this.className, "opacity", "0.001");
	}

	#disposeRenderingModeListener?: VoidFunction;
	updateRenderingMode() {
		this.#disposeRenderingModeListener?.();

		this.#disposeRenderingModeListener = getRenderingMode((mode) => {
			this.canvas?.remove();
			this.canvas = undefined;

			if (this.visualDebug) {
				this.canvas = this.createIgnoredElement("canvas");
				this.canvas.style.position = "absolute";
				this.canvas.style.pointerEvents = "none";
				this.canvas.style.top = "0";
				this.canvas.style.left = "50%";
				this.canvas.style.transform = "translateX(-50%)";

				this.container.prepend(this.canvas);

				this.updateStyles(this.className, "mask-image", null);
			} else if (mode === CanvasMaskRenderMode.DataUri) {
				this.canvas = this.createIgnoredElement("canvas");
				this.updateStyles(this.className, "will-change", "mask-image");
			} else if (mode === CanvasMaskRenderMode.MozElement) {
				this.canvas = this.createIgnoredElement("canvas");
				this.canvas.style.display = "none";
				this.canvas.id = this.className;
				this.document.head.prepend(this.canvas);
			}

			if (this.canvas) {
				this.canvas.width = this.canvasRect.width;
				this.canvas.height = this.canvasRect.height;
				this.canvas.style.width = `${this.canvasRect.width}px`;
				this.canvas.style.height = `${this.canvasRect.height}px`;
			}

			this.canvasContext = this.canvas?.getContext("2d", {
				willReadFrequently: !this.visualDebug,
				alpha: true,
			});

			this.stagger.requestAnimation([this]);
		});
	}

	get visualDebug() {
		return this.options.visualDebug;
	}

	get streaming() {
		return this.stagger.streaming ?? false;
	}

	dispose() {
		this.container = undefined;
		this.#disposeRenderingModeListener?.();
		this.updateStyles(this.className, null);
		this.updateStyles(this.customAnimationClassName, null);

		this.stagger.texts = this.stagger.texts.filter(
			(text) => text.id !== this.id,
		);
	}

	get texts() {
		return this.stagger.texts as this[];
	}

	paint() {
		this.lastPaint = Date.now();
		this.stagger.lastPaint = this.lastPaint;

		if (this.canvasContext) {
			doPaint(this.canvasContext, this);
		}

		this.updateStyles(this.className, "mask-image", this.mask);
		this.updateStyles(this.className, "opacity", null);

		this.updateProperty("data-progress", `${Math.round(this.progress * 100)}`);

		if (this.parentText) {
			this.stagger.requestAnimation([this.parentText]);
		}
	}

	get mask() {
		if (this.visualDebug || !this.elements.length) {
			return null;
		}

		const mode = getRenderingMode();

		if (mode === CanvasMaskRenderMode.MozElement) {
			return `-moz-element(#${this.className})`;
		}

		if (mode === CanvasMaskRenderMode.WebkitCanvas) {
			return `-webkit-canvas(${this.className})`;
		}

		if (mode === CanvasMaskRenderMode.PaintWorkletArg) {
			return `paint(text-stagger, ${JSON.stringify(JSON.stringify(this))})`;
		}

		if (mode === CanvasMaskRenderMode.PaintWorkletCssVar) {
			this.updateStyles(
				this.className,
				"--text-stagger",
				JSON.stringify(JSON.stringify(this)),
			);

			return "paint(text-stagger)";
		}

		if (this.canvas && mode === CanvasMaskRenderMode.DataUri) {
			this.updateStyles(this.className, "--text-stagger", null);

			return `url(${this.canvas.toDataURL("image/png", 0)})`;
		}

		return null;
	}

	get subtexts() {
		return this.stagger.texts.filter((text) => text.parent === this);
	}

	get continuousChildNodes(): {
		nodes: readonly RangesChildNode[];
		boxes: Box<Text | Stagger>[];
		subtext: Text | null;
	}[] {
		if (!this.childNodes.length) {
			return [];
		}

		if (!this.subtexts.length) {
			return [
				{ nodes: this.childNodes, boxes: this.uniqueBoxes, subtext: null },
			];
		}

		const continuousChildNodes: {
			nodes: RangesChildNode[];
			boxes: Box<Text | Stagger>[];
			subtext: Text | null;
		}[] = [{ nodes: [], boxes: [], subtext: null }];

		const boxes = this.boxes;
		let currentBoxIndex = 0;

		for (const childNode of this.childNodes) {
			const lastSegment = continuousChildNodes.at(-1)!;

			if (typeof childNode === "string") {
				lastSegment.nodes.push(childNode);
				continue;
			}

			const rangeBoxes = boxes[currentBoxIndex++]!;
			const range = childNode;

			const startSubtext = this.subtexts.find((subtext) => {
				const firstRange = subtext.ranges[0];

				return (
					firstRange?.compareBoundaryPoints(Range.START_TO_START, range) === 0
				);
			});

			if (startSubtext) {
				continuousChildNodes.push({
					nodes: [range],
					boxes: rangeBoxes,
					subtext: startSubtext,
				});
			} else {
				lastSegment.nodes.push(range);
				lastSegment.boxes.push(...rangeBoxes);
			}

			const endSubtext = this.subtexts.find((subtext) => {
				const lastRange = subtext.ranges.at(-1);

				return lastRange?.compareBoundaryPoints(Range.END_TO_END, range) === 0;
			});

			if (endSubtext) {
				continuousChildNodes.push({ nodes: [], boxes: [], subtext: null });
			}
		}

		if (continuousChildNodes.at(0)?.nodes.length === 0) {
			continuousChildNodes.shift();
		}

		if (continuousChildNodes.at(-1)?.nodes.length === 0) {
			continuousChildNodes.pop();
		}

		return continuousChildNodes;
	}

	get continuousChildNodesOffsets() {
		let childNodeOffset = 0;

		return this.continuousChildNodes.map(
			({ nodes: childNodes, boxes, subtext }) => {
				const nodes = childNodes.map((childNode) => {
					const length = childNode.toString().length;
					const offset = {
						childNode,
						start: childNodeOffset,
						end: childNodeOffset + length,
					};
					childNodeOffset += length;
					return offset;
				});

				const start = nodes.at(0)!.start;
				const end = nodes.at(-1)!.end;

				return {
					nodes,
					start,
					end,
					boxes,
					subtext,
				};
			},
		);
	}

	get closestCommonParent() {
		if (!this.parentText) {
			return null;
		}

		if (this.#closestCommonParent) {
			return this.#closestCommonParent;
		}

		const element = getSafeContainer(
			this.parentText.container,
			this.container,
			(node) => !this.isIgnoredNode(node, false),
		);

		const rect = element.getBoundingClientRect();

		return (this.#closestCommonParent = { element, rect });
	}

	toJSON() {
		return {
			canvasRect: {
				width: this.canvasRect.width,
				height: this.canvasRect.height,
			},
			parentText: this.parentText && {
				id: this.parentText.id,
			},
			id: this.id,
			innerText: this.innerText,
			progress: this.progress,
			subtexts: this.subtexts,
			elements: this.elements as SerializedStaggerElement[],
			visualDebug: this.visualDebug,
			streaming: this.streaming,
		};
	}

	get isHiddenElement(): boolean {
		if (!this.parentText) {
			return false;
		}

		if (this.parentText.isHiddenElement) {
			return true;
		}

		const firstRange = this.ranges.at(0);
		const lastRange = this.ranges.at(-1);

		if (!firstRange || !lastRange) {
			return false;
		}

		return this.parentText.elements.some((element) => {
			if (!element.ranges.length) {
				return false;
			}

			return (
				firstRange.compareBoundaryPoints(
					Range.START_TO_START,
					element.ranges[0]!,
				) === 1 &&
				lastRange.compareBoundaryPoints(
					Range.END_TO_END,
					element.ranges.at(-1)!,
				) === -1
			);
		});
	}

	diffElements(
		event: ScanEvent = { reason: ScanReason.Force },
		resized?: boolean,
	) {
		const oldElements = this.elements;
		this.elements = [];

		if (this.isHiddenElement) {
			return;
		}

		const trimChildNodes = this.createChildNodeTrimmer();
		const forceReset = event.reason === ScanReason.Force && event.reset;

		const newSplitElements = this.options.splitText(this, event);

		const diffs = [
			...calcSlices(
				oldElements as (StaggerElement | ParsedTextSplit)[],
				newSplitElements as (StaggerElement | ParsedTextSplit)[],
				(elementIndex, splitIndex) => {
					if (elementIndex === -1 || splitIndex === -1) {
						return false;
					}

					const element = oldElements[elementIndex]!;
					const textSplit = newSplitElements[splitIndex]!;

					return element.updateTextSplit(textSplit, trimChildNodes, forceReset);
				},
			),
		];

		let restartFrom: StaggerElement | Text | undefined;

		diffs.forEach(([action, items], i) => {
			const isLastDiff = i === diffs.length - 1;

			if (action === 0) {
				for (const element of items as StaggerElement[]) {
					if (resized) {
						element.rescan();
					}

					this.elements.push(element);
				}

				return;
			}

			if (action === -1) {
				const elements = items as StaggerElement[];

				restartFrom ??= this.elements.at(-1) ?? this;

				elements.forEach((element) => {
					element.dispose();
				});

				return;
			}

			const splits = items as ParsedTextSplit[];

			for (const text of this.previousTexts) {
				text.revealTrailing();
			}

			const newElements = splits.flatMap((split, i) => {
				const isLastElement =
					this === this.stagger.texts.at(-1) &&
					isLastDiff &&
					i === splits.length - 1;

				if (
					isLastElement &&
					this.options.delayTrailing &&
					this.stagger.streaming === true
				) {
					this.trailingSplit = split;
					return [];
				}

				return new StaggerElement(
					this,
					trimChildNodes(split.start, split.end),
					split,
				);
			});

			restartFrom ??= newElements[0];
		});

		if (restartFrom) {
			this.stagger.restartAnimationFrom(restartFrom, false);
			restartFrom = undefined;
		}

		function refreshSubtextElements(text: Text) {
			for (const subtext of text.subtexts) {
				if (
					subtext.isHiddenElement
						? !subtext.elements.length
						: subtext.elements.length
				) {
					continue;
				}

				restartFrom ??= subtext;

				subtext.diffElements({ reason: ScanReason.Force });

				refreshSubtextElements(subtext);
			}
		}

		refreshSubtextElements(this);

		if (restartFrom) {
			this.stagger.restartAnimationFrom(restartFrom, false);

			for (const element of this.elements) {
				element.rescan();
			}
		}
	}

	private updateBlockDisplay() {
		const isBlock = hasBlockElement(
			this.window,
			this.container,
			(node) => !this.isIgnoredNode(node, false),
		);

		this.updateStyles(
			this.className,
			"display",
			isBlock ? "block" : "inline-block",
		);
	}

	scanElementLines(event: ScanEvent = { reason: ScanReason.Force }) {
		if (event.reason === ScanReason.Mutation) {
			this.updateBlockDisplay();
		}

		const oldDimensions = this.#scannedCanvasDimensions;

		this.#scannedCanvasDimensions = {
			width: this.canvasRect.width,
			height: this.canvasRect.height,
		};

		if (
			oldDimensions?.width !== this.canvasRect.width ||
			oldDimensions.height !== this.canvasRect.height
		) {
			if (this.canvas) {
				this.canvas.width = this.canvasRect.width;
				this.canvas.height = this.canvasRect.height;
				this.canvas.style.width = `${this.canvasRect.width}px`;
				this.canvas.style.height = `${this.canvasRect.height}px`;
			}

			if (
				!this.visualDebug &&
				getRenderingMode() === CanvasMaskRenderMode.WebkitCanvas
			) {
				this.canvasContext = this.document.getCSSCanvasContext?.(
					"2d",
					this.className,
					this.canvasRect.width,
					this.canvasRect.height,
				);
			}
		}

		const resized = super.scanElementLines(event);

		this.diffElements(event, resized);

		for (const element of this.elements) {
			element.updateBoundsIfLinesChanged();
		}

		this.updateProperty("data-lines", `${this.lines.length}`);
		this.updateProperty("data-elements", `${this.elements.length}`);

		this.paint();

		this.stagger.requestAnimation([this]);

		return resized;
	}

	updateProperty(name: string, value: string | number) {
		value = String(value);

		if (value === this.container.getAttribute(name)) {
			return;
		}

		this.ignoreNextMutation = true;
		this.container.setAttribute(name, value);
	}

	override createLine(
		blockParent: HTMLElement,
		startOfBlock: boolean,
		endOfBlock: boolean,
		ranges: Range[],
	): TextLine {
		return new TextLine(
			this,
			this.lines.length,
			blockParent,
			startOfBlock,
			endOfBlock,
			ranges,
			this.options,
		);
	}
}

export type SerializedText = ReturnType<Text["toJSON"]>;

function getAvailableSpace(
	window: Window,
	element: HTMLElement,
	elementRect: { left: number; right: number },
) {
	// Initialize variables to store the nearest overflow container's bounds
	let overflowContainer: HTMLElement | null = null;
	let overflowContainerRect: {
		left: number;
		right: number;
		width: number;
	} | null = null;

	// Start from the parent and traverse up the DOM tree
	let currentElement = element.parentElement;

	while (currentElement && currentElement !== window.document.body) {
		const style = window.getComputedStyle(currentElement);
		const overflowX = style.overflowX;

		if (
			overflowX === "hidden" ||
			overflowX === "scroll" ||
			overflowX === "auto"
		) {
			overflowContainer = currentElement;
			overflowContainerRect = currentElement.getBoundingClientRect();
			break;
		}

		currentElement = currentElement.parentElement;
	}

	// If no overflow container found, use viewport dimensions
	if (!overflowContainerRect) {
		overflowContainerRect = {
			left: 0,
			right: window.innerWidth,
			width: window.innerWidth,
		};
	}

	overflowContainer ||= window.document.body;

	const styles = window.getComputedStyle(overflowContainer);

	const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0;
	const paddingRight = Number.parseFloat(styles.paddingRight) || 0;

	// Calculate available space
	const left = Math.max(
		0,
		elementRect.left - overflowContainerRect.left - paddingLeft,
	);

	const right = Math.max(
		0,
		overflowContainerRect.right - elementRect.right - paddingRight,
	);

	return {
		left,
		right,
		overflowContainer,
	};
}

function hasBlockElement(
	window: Window,
	element: Element,
	acceptNode?: (node: Node) => boolean,
) {
	// Get computed style for direct children
	for (const child of element.children) {
		if (acceptNode && !acceptNode(child)) continue;

		const display = window.getComputedStyle(child).display;

		// Check if current element is block
		if (
			display === "block" ||
			display === "flex" ||
			display === "grid" ||
			display === "list-item"
		) {
			return true;
		}

		// Recursively check children
		if (hasBlockElement(window, child, acceptNode)) {
			return true;
		}
	}

	return false;
}

function getSafeContainer(
	root: HTMLElement,
	element: HTMLElement,
	acceptNode?: (node: Node) => boolean,
) {
	let current = element;
	let lastElement = element;

	while (true) {
		// Store current before moving to parent
		lastElement = current;

		// Move to parent first
		if (current.parentElement) {
			current = current.parentElement;
		} else {
			return lastElement;
		}

		const looseText = hasLooseText(
			current,
			(node) => node !== lastElement && (!acceptNode || acceptNode(node)),
		);

		if (looseText) {
			return lastElement;
		}

		if (current === root) {
			return lastElement;
		}
	}
}

function hasLooseText(
	node: Node,
	acceptNode: (node: Node) => boolean,
): boolean {
	return [...node.childNodes].some((node) => {
		if (node.nodeType === Node.TEXT_NODE) {
			return node.textContent?.trim();
		}

		return acceptNode(node) && hasLooseText(node, acceptNode);
	});
}
