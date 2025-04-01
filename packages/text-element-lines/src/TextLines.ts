import { Ranges } from "./Ranges.js";
import { TextLine } from "./TextLine.js";
import { createParentChecker } from "./utils/parentChecker.js";
import { PositionObserver } from "./utils/positionObserver.js";

import { Box, type BoxParent } from "./Box.js";

export enum ScanReason {
	Resize = "resize",
	Mounted = "mounted",
	Mutation = "mutation",
	Force = "force",
}

export interface ForcedScanEvent {
	reason: ScanReason.Force;
	reset?: boolean;
	data?: any;
}

export interface MutationScanEvent {
	reason: ScanReason.Mutation;
	entries: MutationRecord[];
}

export interface MountedScanEvent {
	reason: ScanReason.Mounted;
}

export interface ResizeScanEvent {
	reason: ScanReason.Resize;
	entries: ResizeObserverEntry[];
}

export type ScanEvent =
	| MountedScanEvent
	| MutationScanEvent
	| ResizeScanEvent
	| ForcedScanEvent;

// text-stagger-record overwrites requestAnimationFrame and cancelAnimationFrame
const { requestAnimationFrame } = globalThis;

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

// Define the TextLines interface
export interface TextLines<
	LineType extends TextLine = TextLine,
	Parent extends BoxParent = BoxParent,
> extends Ranges<Box, Parent> {
	lines: LineType[];
	ready: Promise<void>;
	text: TextLines<LineType, Parent>;
	options: object;
	document: Document;
	window: Window & typeof globalThis;
	ignoreNextMutation(): void;
	ignoredNodes: Set<Node>;
	parents: Set<EventTarget>;

	createIgnoredElement(element: HTMLElement, global?: boolean): void;
	createIgnoredElement<K extends keyof HTMLElementTagNameMap>(
		element: K,
		global?: boolean,
	): HTMLElementTagNameMap[K];
	isIgnoredNode(
		node: Node,
		recursive: boolean | ((node: Node) => boolean),
	): boolean;

	createLine(
		blockParent: HTMLElement,
		startOfBlock: boolean,
		endOfBlock: boolean,
		ranges: Range[],
	): LineType;
	scanLines(): LineType[];
	scanBoxes(rects: DOMRect[][]): Box[][];

	// Additional methods
	scanElementLines(event?: ScanEvent): boolean;
	updateProperty(name: string, value: string | number): void;
	convertToPx(
		cssLiteral: string | number,
		dimensions: { height: number; width: number },
	): number;
	dispose(): void;
	findLineContainingNode(node: Node): LineType | undefined;

	// Properties
	get texts(): this[];

	readonly root: this;
	readonly parentText: this | undefined;
	readonly previousTexts: this[];
	readonly nextTexts: this[];
}

const constructors: any[] = [];

export function createTextLines<T>(
	RangesBase: abstract new (...args: any[]) => T,
): new <LineType extends TextLine, Parent extends BoxParent>(
	parent: Parent,
	element: HTMLElement,
	options?: object,
) => TextLines<LineType, Parent> & T {
	const Base = RangesBase as any as typeof Ranges;

	class TextLines<
		LineType extends TextLine = TextLine,
		Parent extends BoxParent = BoxParent,
	> extends Base<Box<TextLines<LineType, Parent>>> {
		static [Symbol.hasInstance](value: any) {
			return constructors.some((TextLines) =>
				Function.prototype[Symbol.hasInstance].call(TextLines, value),
			);
		}

		parents = new Set<EventTarget>();

		#mutationCache = new WeakMap<Node, number>();
		#lines: LineType[] = [];
		#scannedDimensions?: {
			width: number;
			height: number;
		};
		#resolvePendingReady?: VoidFunction;
		#pixelContainer: HTMLElement;
		#pixelTarget: HTMLElement;

		ignoredNodes = new Set<Node>();
		#globalIgnoredNodes = new Set<Node>();
		ready = Promise.resolve();
		text = this;
		parentText: this | undefined;
		root!: this;

		set parent(parent: Parent) {
			super.parent = parent;

			this.parentText =
				parent instanceof TextLines ? (parent as any) : undefined;

			this.root = this.parentText?.root ?? this;
		}

		get parent(): Parent {
			return super.parent;
		}

		createIgnoredElement(element: HTMLElement, global?: boolean): void;
		createIgnoredElement<K extends keyof HTMLElementTagNameMap>(
			element: K,
			global?: boolean,
		): HTMLElementTagNameMap[K];
		createIgnoredElement(
			element: HTMLElement | keyof HTMLElementTagNameMap,
			global = false,
		) {
			if (typeof element === "string") {
				element = this.document.createElement(element);
			}

			if (global) {
				this.#globalIgnoredNodes.add(element);
			}

			for (const text of global ? this.texts : [this]) {
				text.ignoredNodes.add(element);
			}

			return element;
		}

		isIgnoredNode(node: Node, recursive: boolean | ((node: Node) => boolean)) {
			let currentElement: Node | null = node;

			while (currentElement) {
				let ignored = this.ignoredNodes.has(currentElement);

				if (typeof recursive === "function") {
					ignored &&= recursive(currentElement);
				}

				if (ignored || !recursive) {
					return ignored;
				}

				currentElement = currentElement.parentElement;
			}

			return false;
		}

		createLine(
			blockParent: HTMLElement,
			startOfBlock: boolean,
			endOfBlock: boolean,
			ranges: Range[],
		): LineType {
			return new TextLine(
				this,
				this.options,
				blockParent,
				startOfBlock,
				endOfBlock,
				ranges,
			) as LineType;
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

		scanLines(): LineType[] {
			const lines: LineType[] = [...this.lines];
			const lastRange = lines.at(-1)?.ranges.at(-1);
			const lastScannedNode = lastRange?.endContainer;
			const lastScannedOffset = lastRange?.endOffset ?? 0;

			let foundFollowing = false;

			const walker = this.document.createTreeWalker(
				this.container,
				NodeFilter.SHOW_TEXT,
				{
					acceptNode: (node) => {
						if (
							!lastScannedNode ||
							lastScannedNode === node ||
							foundFollowing
						) {
							return NodeFilter.FILTER_ACCEPT;
						}

						const position = lastScannedNode.compareDocumentPosition(node);
						if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
							foundFollowing = true;
							return NodeFilter.FILTER_ACCEPT;
						}

						return NodeFilter.FILTER_REJECT;
					},
				},
			);

			const nodes: globalThis.Text[] = [];
			while (walker.nextNode()) {
				nodes.push(walker.currentNode as globalThis.Text);
			}

			const checkParents = createParentChecker(this);

			const textNodes = nodes
				.flatMap((textNode) => {
					const { textContent } = textNode;
					if (!textContent) {
						return [];
					}

					const { isHidden, subtext, style, blockParent } =
						checkParents(textNode);

					if (isHidden) {
						return [];
					}

					return { blockParent, textNode, textContent, subtext, style };
				})
				.map((node, i, textNodes) => {
					const prev = textNodes[i - 1];
					const next = textNodes[i + 1];
					const { subtext, blockParent } = node;

					const newNode = Object.assign(node, {
						startOfBlock: blockParent !== prev?.blockParent,
						endOfBlock: !!next && blockParent !== next.blockParent,
						startOfSubtext: subtext && subtext !== prev?.subtext,
						endOfSubtext: subtext && subtext !== next?.subtext,
					});

					return Object.assign(newNode, {
						prev: prev as typeof newNode,
						next: next as typeof newNode,
					});
				})
				.map((node) => {
					const newRange = node.startOfSubtext || node.prev?.endOfSubtext;
					return Object.assign(node, { newRange });
				});

			const lastTextNode = textNodes.at(-1);
			if (!lastTextNode) {
				return [];
			}

			textNodes.forEach((node) => {
				let {
					textNode,
					startOfBlock,
					newRange,
					endOfBlock,
					textContent,
					blockParent,
				} = node;

				let start = textNode === lastScannedNode ? lastScannedOffset : 0;

				while (start < textContent.length) {
					const range = this.document.createRange();

					// Start with maximum possible range
					range.setStart(textNode, start);
					range.setEnd(textNode, textContent.length);

					const newLine = this.createLine(
						blockParent,
						startOfBlock,
						endOfBlock,
						[range],
					);

					const [firstBox, secondBox] = newLine.uniqueBoxes;

					// Handle the case where the node has no content
					if (!firstBox) {
						newLine.dispose();
						return;
					}

					const { top } = firstBox;

					if (secondBox) {
						let wrapStart = start;
						let wrapEnd = textContent.length;

						// Binary search for the break point
						while (wrapStart <= wrapEnd) {
							const mid = Math.ceil((wrapStart + wrapEnd) / 2);

							range.setStart(textNode, start);
							range.setEnd(textNode, mid);
							newLine.childNodes = [range];

							const isWrapped =
								newLine.uniqueBoxes[0]!.top > top ||
								newLine.uniqueBoxes.length > 1;

							if (isWrapped) {
								wrapEnd = mid - 1;
							} else {
								wrapStart = mid + 1;
							}
						}

						// After the loop, wrapEnd will be at the last position that doesn't cause wrapping
						range.setStart(textNode, start);
						range.setEnd(textNode, wrapEnd);

						newLine.childNodes = [range];
					}

					const existingLine = lines.findLast((existingLine) => {
						const lineBoxes = existingLine.uniqueBoxes;
						const newBoxes = newLine.uniqueBoxes;

						const aroundSameLine = lineBoxes.some((box) =>
							newBoxes.some(
								(newBox) => newBox.top < box.bottom && newBox.bottom > box.top,
							),
						);

						if (aroundSameLine && newLine.left >= existingLine.right) {
							return true;
						}

						if (existingLine.blockParent === newLine.blockParent) {
							return (
								Math.abs(existingLine.top - newLine.top) <= 1 &&
								Math.abs(existingLine.bottom - newLine.bottom) <= 1
							);
						}

						return aroundSameLine;
					});

					if (existingLine) {
						const ranges = [...existingLine.ranges];
						const lastRange = newRange ? null : ranges.pop();
						ranges.push(...this.combineAdjoining([lastRange, range]));

						if (existingLine.ranges.length !== ranges.length) {
							newRange = false;
						}

						existingLine.childNodes = ranges;
						newLine.dispose();
					} else {
						newRange = false;
						lines.push(newLine);
					}

					// todo fix
					if (start > range.endOffset) {
						return;
					}

					// Move to next position
					start = range.endOffset;
				}
			});

			// Sort lines by vertical position
			lines.sort((a, b) => a.comparePosition(b));

			let offset = 0;

			lines.forEach((line, i) => {
				line.startOfText = i === 0;
				line.endOfText = i === lines.length - 1;

				line.index = i;
				line.start = offset;
				line.end = offset + line.innerText.length;
				offset = line.end;
			});

			return lines;
		}

		get lines(): LineType[] {
			return this.#lines;
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

		#resizeObserver?: ResizeObserver;
		#mutationObserver?: MutationObserver;
		#positionObserver?: PositionObserver;
		#ignoreNextMutation = false;

		ignoreNextMutation() {
			let text = this;

			do {
				text.#ignoreNextMutation = true;
			} while (text.parentText && (text = text.parentText));
		}

		get container(): HTMLElement {
			return super.container;
		}

		get texts() {
			return [this];
		}

		get previousTexts() {
			const index = this.texts.indexOf(this);
			return this.texts.slice(0, index);
		}

		get nextTexts() {
			const index = this.texts.indexOf(this);
			return this.texts.slice(index + 1);
		}

		set container(container: HTMLElement | undefined) {
			if (container === super.container) {
				return;
			}

			if (!container) {
				this.#mutationObserver?.disconnect();
				this.#resizeObserver?.disconnect();
				this.#positionObserver?.disconnect();

				this.parents.forEach((parent) => {
					parent.removeEventListener("scroll", this.handleScroll as any, true);
				});

				this.parents = new Set();

				this.#resolvePendingReady?.();

				for (const text of this.texts) {
					for (const node of text.#globalIgnoredNodes) {
						text.ignoredNodes.delete(node);
					}
				}

				return;
			}

			this.container &&= undefined;

			super.container = container;

			const walker = this.document.createTreeWalker(
				container,
				NodeFilter.SHOW_TEXT,
			);

			const firstNode = walker.nextNode();
			walker.currentNode = container;
			const lastNode = walker.lastChild();

			if (firstNode && lastNode?.textContent != null) {
				const range = this.document.createRange();

				range.setStart(firstNode, 0);
				range.setEnd(lastNode, lastNode.textContent.length);

				this.childNodes = [range];
			}

			let currentNode = this.container.parentNode;
			while (
				currentNode &&
				currentNode !== this.window.document.documentElement
			) {
				this.parents.add(currentNode);

				currentNode.addEventListener("scroll", this.handleScroll as any, true);
				currentNode = currentNode.parentNode;
			}

			this.parents.add(this.window);
			this.window.addEventListener("scroll", this.handleScroll as any, true);

			let mounted = false;

			this.#positionObserver = new PositionObserver(this.window, () => {
				this.updateBounds();
			});

			this.ready = new Promise<void>((r) => (this.#resolvePendingReady = r));

			this.updateBounds();
			this.scanElementLines({ reason: ScanReason.Mounted });

			this.#resizeObserver = new ResizeObserver((entries) => {
				if (mounted) {
					this.scanElementLines({ reason: ScanReason.Resize, entries });
				} else {
					this.updateBounds();
					this.scanElementLines({ reason: ScanReason.Mounted });
					this.#resolvePendingReady?.();
				}

				mounted = true;
			});

			let mutations: MutationRecord[] = [];
			let mutationScanner: number | undefined;

			this.#mutationObserver = new MutationObserver((entries) => {
				if (this.#ignoreNextMutation) {
					this.#ignoreNextMutation = false;

					return;
				}

				mutations.push(...entries);

				mutations = mutations.filter((mutation) => {
					if (this.isIgnoredNode(mutation.target, true)) {
						return false;
					}

					const nodes = mutation.addedNodes.length
						? [...mutation.addedNodes]
						: [...mutation.removedNodes];

					if (!nodes.length) {
						return true;
					}

					return nodes.some((node) => !this.isIgnoredNode(node, false));
				});

				if (!mutations.length) {
					return;
				}

				mutationScanner ??= requestAnimationFrame(() => {
					this.scanElementLines({
						reason: ScanReason.Mutation,
						entries: mutations,
					});

					mutations = [];
					mutationScanner = undefined;
				});
			});

			this.#positionObserver.observe(this.container);
			this.#resizeObserver.observe(this.container);

			this.#mutationObserver.observe(this.container, {
				childList: true,
				subtree: true,
				attributes: true,
				characterData: true,
			});
		}

		updateBoundsOnNextFrame() {
			requestAnimationFrame(() => {
				this.updateBounds();
			});
		}

		handleScroll = () => {
			this.updateBoundsOnNextFrame();
		};

		constructor(
			parent: Parent,
			element: HTMLElement,
			public override options: { asyncFirstScan?: boolean } = {},
		) {
			super(parent, options, undefined!);

			this.#pixelContainer = this.createIgnoredElement("div", true);
			this.#pixelContainer.style.position = "absolute";
			this.#pixelTarget = this.createIgnoredElement("div", true);
			this.#pixelContainer.appendChild(this.#pixelTarget);

			for (const text of this.texts) {
				for (const node of text.#globalIgnoredNodes) {
					this.ignoredNodes.add(node);
				}
			}

			this.parent = parent;

			this.container = element;
		}

		dispose() {
			super.dispose();

			this.container = undefined;
		}

		scanElementLines(event: ScanEvent = { reason: ScanReason.Force }) {
			if (event.reason === ScanReason.Mutation) {
				const impacts = this.analyzeMutationImpact(event.entries);

				if (impacts.requiresFullRescan) {
					this.#lines.forEach((line) => line.dispose());
					this.#lines = [];
				} else {
					const retainedLines = this.lines.slice(0, impacts.firstAffectedLine);
					const removedLines = this.lines.slice(impacts.firstAffectedLine);
					removedLines.forEach((line) => line.dispose());

					this.#lines = retainedLines;
				}
			}

			const oldDimensions = this.#scannedDimensions;

			this.#scannedDimensions = {
				width: this.width,
				height: this.height,
			};

			const resized =
				oldDimensions?.width !== this.width ||
				oldDimensions.height !== this.height;

			if (resized || (event.reason === ScanReason.Force && event.reset)) {
				this.#lines.forEach((line) => line.dispose());
				this.#lines = [];
			}
			this.#lines = this.scanLines();
			this.childNodes = this.lines.flatMap((line) => line.childNodes);

			return resized;
		}

		updateProperty(name: string, value: string | number) {
			value = String(value);
			this.ignoreNextMutation();
			this.container.setAttribute(name, value);
		}

		#pixelCache = new Map<string, number>();

		convertToPx(
			cssLiteral: string | number,
			{ height, width }: { height: number; width: number },
		) {
			if (typeof cssLiteral === "number") {
				return cssLiteral;
			}

			if (cssLiteral.endsWith("px")) {
				return Number.parseFloat(cssLiteral);
			}

			const key = `${height}:${width}:${cssLiteral}`;

			if (!this.#pixelCache.has(key)) {
				this.#pixelContainer.style.height = `${height}px`;
				this.#pixelContainer.style.width = `${width}px`;
				this.#pixelTarget.style.width = cssLiteral;
				this.container.appendChild(this.#pixelContainer);

				this.#pixelCache.set(key, this.#pixelTarget.offsetWidth);
				this.#pixelContainer.remove();
			}

			return this.#pixelCache.get(key)!;
		}

		private analyzeMutationImpact(
			mutations: MutationRecord[],
		):
			| { requiresFullRescan: true; firstAffectedLine?: undefined }
			| { requiresFullRescan: false; firstAffectedLine: number } {
			let firstAffectedLine: number | null = null;

			for (const mutation of mutations) {
				switch (mutation.type) {
					// Text content changed
					case "characterData": {
						if (mutation.target instanceof this.window.Text) {
							const lineIndex =
								this.findLineContainingNode(mutation.target)?.index ?? -1;

							if (lineIndex === -1) {
								return { requiresFullRescan: true };
							}

							firstAffectedLine = Math.min(
								firstAffectedLine ?? lineIndex,
								lineIndex,
							);
						}

						break;
					}

					// Nodes added or removed
					case "childList": {
						for (const node of mutation.addedNodes) {
							const lineIndex =
								this.findLineContainingNode(
									node.previousSibling ??
										node.parentElement ??
										this.document.body,
								)?.index ?? -1;

							if (lineIndex === -1) {
								return { requiresFullRescan: true };
							}

							firstAffectedLine = Math.min(
								firstAffectedLine ?? lineIndex,
								lineIndex,
							);
						}

						break;
					}

					// Style changes that might affect layout
					case "attributes": {
						const element = mutation.target as HTMLElement;

						if (this.doesAttributeAffectLayout(mutation.attributeName!)) {
							const lineIndex =
								this.findLineContainingNode(element)?.index ?? -1;

							if (lineIndex === -1) {
								return { requiresFullRescan: true };
							}

							firstAffectedLine = Math.min(
								firstAffectedLine ?? lineIndex,
								lineIndex,
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

		findLineContainingNode(node: Node): LineType | undefined {
			// First check cache
			const cachedIndex = this.#mutationCache.get(node);
			if (cachedIndex != null) {
				return this.lines[cachedIndex];
			}

			const line = this.lines.findLast((line) =>
				line.ranges.some((range) => range.intersectsNode(node)),
			);

			this.#mutationCache.set(node, line?.index ?? -1);

			return line;
		}

		private doesAttributeAffectLayout(attributeName: string): boolean {
			return LAYOUT_AFFECTING_ATTRIBUTES.has(attributeName.toLowerCase());
		}
	}

	constructors.push(TextLines);

	return TextLines as any;
}

// Create the default TextLines class
export const TextLines = createTextLines(Ranges);
