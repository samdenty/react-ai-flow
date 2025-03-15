import type {
	ElementOptions,
	Stagger,
	StaggerElementBoxOptions,
} from "../stagger/index.js";
import type { Text } from "./Text.js";
import type { TextLine } from "./TextLine.js";
import { updateStyles } from "./styles/properties.js";

export class Box<
	T extends Ranges<any, any> | Stagger = Ranges<any, any> | Stagger,
> {
	#disposers = new Set<VoidFunction>();
	#container!: HTMLElement;

	stagger: Stagger;

	#parentRanges?: Ranges<any, any>;
	#parentLeft = 0;
	#parentTop = 0;
	#rectListeners = new Set<() => void>();

	get container() {
		return this.#container;
	}

	set container(container: HTMLElement) {
		this.#container = container;
	}

	private updateParentCoords = () => {
		this.#parentLeft = this.#parentRanges?.left ?? 0;
		this.#parentTop = this.#parentRanges?.top ?? 0;
	};

	static getBounds(
		boxes: { top: number; left: number; bottom: number; right: number }[],
	) {
		return boxes.reduce(
			(bounds, rect, i) => {
				if (i === 0) {
					return {
						top: rect.top,
						left: rect.left,
						bottom: rect.bottom,
						right: rect.right,
					};
				}

				return {
					top: Math.min(rect.top, bounds.top),
					left: Math.min(rect.left, bounds.left),
					bottom: Math.max(rect.bottom, bounds.bottom),
					right: Math.max(rect.right, bounds.right),
				};
			},
			{ top: 0, left: 0, bottom: 0, right: 0 },
		);
	}

	containedWithin(other: Box<any>) {
		return (
			this.top >= other.top &&
			this.bottom <= other.bottom &&
			this.left >= other.left &&
			this.right <= other.right
		);
	}

	drawDebugBox() {
		const element = this.document.createElement("div");
		element.style.position = "fixed";
		element.style.top = `${this.top}px`;
		element.style.left = `${this.left}px`;
		element.style.width = `${this.width}px`;
		element.style.height = `${this.height}px`;
		element.style.backgroundColor = "red";
		element.style.zIndex = "1000";
		this.document.body.appendChild(element);
	}

	window: Window & typeof globalThis;
	document: Document;

	constructor(
		public parent: T,
		public options: ElementOptions,
		element: HTMLElement,
		private relativeTopToParent = 0,
		private relativeLeftToParent = 0,
		public width = 0,
		public height = 0,
	) {
		if (parent instanceof Ranges) {
			this.#parentRanges = parent;
			this.stagger = parent.stagger;

			let parentRanges = parent;

			do {
				const parent = parentRanges;
				parent.#rectListeners.add(this.updateParentCoords);

				this.#disposers.add(() => {
					parent.#rectListeners.delete(this.updateParentCoords);
				});
			} while (
				(parentRanges = parentRanges.parent) &&
				parentRanges instanceof Ranges
			);
		} else {
			this.stagger = parent;
		}

		this.window = this.stagger.window;

		this.document = this.window.document;

		this.updateParentCoords();

		this.container = element;
	}

	get relativeToParent(): {
		top: number;
		left: number;
		bottom: number;
		right: number;
		height: number;
		width: number;
	} {
		return this.relativeTo(this.parent);
	}

	static calculateRelative(
		from: {
			top: number;
			left: number;
			bottom: number;
			right: number;
			height: number;
			width: number;
		},
		to:
			| {
					top: number;
					left: number;
					bottom: number;
					right: number;
			  }
			| object,
	) {
		if (!(to instanceof Box)) {
			return {
				top: from.top,
				left: from.left,
				bottom: from.bottom,
				right: from.right,
				width: from.width,
				height: from.height,
			};
		}

		return {
			top: from.top - to.top,
			left: from.left - to.left,
			bottom: from.bottom - to.top,
			right: from.right - to.left,
			width: from.width,
			height: from.height,
		};
	}

	set top(top: number) {
		const oldRelativeTop = this.relativeTopToParent;
		this.updateParentCoords();
		this.relativeTopToParent = top - this.#parentTop;

		if (oldRelativeTop !== this.relativeTopToParent) {
			this.#rectListeners.forEach((listener) => listener());
		}
	}

	set left(left: number) {
		const oldRelativeLeft = this.relativeLeftToParent;
		this.updateParentCoords();
		this.relativeLeftToParent = left - this.#parentLeft;

		if (oldRelativeLeft !== this.relativeLeftToParent) {
			this.#rectListeners.forEach((listener) => listener());
		}
	}

	get top(): number {
		return this.relativeTopToParent + this.#parentTop;
	}

	get left(): number {
		return this.relativeLeftToParent + this.#parentLeft;
	}

	relativeTo(
		other:
			| {
					top: number;
					left: number;
					bottom: number;
					right: number;
			  }
			| object,
	) {
		return Box.calculateRelative(this, other);
	}

	set bottom(bottom: number) {
		this.height = bottom - this.top;
	}

	get bottom() {
		return this.top + this.height;
	}

	set right(right: number) {
		this.width = right - this.left;
	}

	get right() {
		return this.left + this.width;
	}

	dispose() {
		this.#disposers.forEach((dispose) => dispose());
	}
}

export type RangesChildNode = Range | string;

export abstract class Ranges<
	T extends Box<any>,
	U extends Ranges<any, any> | Stagger,
> extends Box<U> {
	#boxes: T[][] = [];
	#childNodes: readonly RangesChildNode[] = [];
	#boundaryPointsCheck = new WeakMap<
		Node,
		Map<number, WeakMap<Node, Map<number, number>>>
	>();
	ranges: Range[] = [];

	/**
	 * The text of *just* the childNodes that are ranges,
	 * **excludes rendered line-breaks
	 */
	textContent!: string;

	/**
	 * The text of *all* the childNodes,
	 * **including rendered line-breaks
	 */
	innerText!: string;

	abstract text: Text;

	get boxes() {
		return this.#boxes;
	}

	uniqueBoxes: T[] = [];

	get lines(): TextLine[] | undefined {
		return undefined;
	}

	updateStyles(
		className: string,
		property: string | null,
		value?: string | null,
	) {
		updateStyles(this.window, className, property, value);
	}

	constructor(
		parent: U,
		public options: StaggerElementBoxOptions,
		element: HTMLElement,
		childNodes?: RangesChildNode[],
	) {
		super(parent, options, element);

		if (childNodes) {
			this.childNodes = childNodes;
		}
	}

	comparePosition(other: this): number {
		const firstBox = this.uniqueBoxes[0];
		const otherFirstBox = other.uniqueBoxes[0];

		if (
			firstBox &&
			otherFirstBox &&
			this.top === other.top &&
			firstBox.left !== otherFirstBox.left
		) {
			return firstBox.left - otherFirstBox.left;
		}

		let range = this.ranges.at(0);
		if (this.ranges.length > 1) {
			range = range?.cloneRange();
			const lastRange = this.ranges.at(-1)!;
			range?.setEnd(lastRange.endContainer, lastRange.endOffset);
		}

		let otherRange = other.ranges.at(0);
		if (other.ranges.length > 1) {
			otherRange = otherRange?.cloneRange();
			const lastRange = other.ranges.at(-1)!;
			otherRange?.setEnd(lastRange.endContainer, lastRange.endOffset);
		}

		if (!range || !otherRange) {
			return 0;
		}

		if (
			range.startContainer === otherRange.startContainer &&
			range.endContainer === otherRange.endContainer &&
			range.startOffset === otherRange.startOffset &&
			range.endOffset === otherRange.endOffset
		) {
			const pos = this.container.compareDocumentPosition(other.container);

			if (pos & Node.DOCUMENT_POSITION_FOLLOWING) {
				return -1;
			}
			if (pos & Node.DOCUMENT_POSITION_PRECEDING) {
				return 1;
			}
			return 0;
		}

		let startPositions = this.#boundaryPointsCheck.get(
			otherRange.startContainer,
		);

		if (!startPositions) {
			startPositions = new Map();
			this.#boundaryPointsCheck.set(otherRange.startContainer, startPositions);
		}

		let endContainers = startPositions.get(otherRange.startOffset);
		if (!endContainers) {
			endContainers = new Map();
			startPositions.set(otherRange.startOffset, endContainers);
		}

		let endPositions = endContainers.get(otherRange.endContainer);
		if (!endPositions) {
			endPositions = new Map();
			endContainers.set(otherRange.endContainer, endPositions);
		}

		let result = endPositions.get(otherRange.endOffset);

		if (result != null) {
			return result;
		}

		const containedWithin =
			otherFirstBox && firstBox?.containedWithin(otherFirstBox);
		const otherContainedWithin =
			firstBox && otherFirstBox?.containedWithin(firstBox);

		if (containedWithin && !otherContainedWithin) {
			return 1;
		}
		if (otherContainedWithin && !containedWithin) {
			return -1;
		}

		const overlapping = !(this.bottom <= other.top || this.top >= other.bottom);

		if (!overlapping) {
			if (this.top !== other.top) {
				const line = this.lines?.[0];
				const otherLine = other.lines?.[0];

				// if both have lines, compare the lines else compare the boxes
				if (!line || !otherLine) {
					return this.top - other.top;
				}

				const pos = line.comparePosition(otherLine);

				if (pos) {
					return pos;
				}
			}

			if (firstBox && otherFirstBox) {
				return firstBox.left - otherFirstBox.left;
			}
		}

		const startPointRange = range.cloneRange();
		startPointRange.setEnd(range.startContainer, range.startOffset);

		const otherStartPointRange = otherRange.cloneRange();
		otherStartPointRange.setEnd(
			otherRange.startContainer,
			otherRange.startOffset,
		);

		result = startPointRange.compareBoundaryPoints(
			Range.START_TO_START,
			otherStartPointRange,
		);

		if (result === 0) {
			const endPointRange = range.cloneRange();
			endPointRange.setStart(range.endContainer, range.endOffset);

			const otherEndPointRange = otherRange.cloneRange();
			otherEndPointRange.setStart(
				otherRange.endContainer,
				otherRange.endOffset,
			);

			result = endPointRange.compareBoundaryPoints(
				Range.START_TO_START,
				otherEndPointRange,
			);
		}

		endPositions.set(otherRange.endOffset, result);

		return result;
	}

	childText: string[] = [];

	set childNodes(childNodes: RangesChildNode[]) {
		this.#childNodes = Object.freeze([...childNodes]);

		this.childText = this.#childNodes.map((childNode) => childNode.toString());
		this.innerText = this.childText.join("");

		this.textContent = this.childText
			.filter((_, i) => typeof this.#childNodes[i] !== "string")
			.join("");

		this.ranges = this.childNodes.filter(
			(content) => typeof content !== "string",
		);

		this.rescan();
	}

	rescan() {
		const rects = this.scanRanges();

		this.updateBounds(rects);

		this.uniqueBoxes.forEach((box) => box.dispose());
		this.#boxes = this.scanBoxes(rects);
		this.uniqueBoxes = [...new Set(this.boxes.flat())];
	}

	get childNodes(): readonly RangesChildNode[] {
		return this.#childNodes;
	}

	updateBounds(rects?: DOMRect[][]): boolean {
		if (!rects) {
			rects = this.scanRanges();
		}

		const bounds = this.scanBounds(rects);

		const changed =
			bounds.top !== this.top ||
			bounds.left !== this.left ||
			bounds.bottom !== this.bottom ||
			bounds.right !== this.right;

		Object.assign(this, bounds);

		if (changed) {
			this.stagger.invalidatePositions();
		}

		return changed;
	}

	scanBounds(
		rects: { top: number; left: number; bottom: number; right: number }[][],
	) {
		return Box.getBounds(rects.flat());
	}

	scanRanges(): DOMRect[][] {
		return this.ranges.map((range) => {
			return optimizeRects([...range.getClientRects()]);
		});
	}

	abstract scanBoxes(rects: DOMRect[][]): T[][];

	createChildNodeTrimmer() {
		const childNodeOffsets = this.childNodesOffsets;
		const offsetsCache = new Map<number, { node: Node; offset: number }>();
		const lastChildCache = new WeakMap<Node, Node>();

		return (start: number, end: number) => {
			return childNodeOffsets.flatMap((pos) => {
				if (pos.end <= start || pos.start >= end) {
					return [];
				}

				const trimFromStart = Math.max(0, start - pos.start);
				const trimFromEnd = Math.max(0, pos.end - end);

				if (
					typeof pos.childNode === "string" ||
					(!trimFromStart && !trimFromEnd)
				) {
					return pos.childNode;
				}

				const trimmedRange = pos.childNode.cloneRange();
				const { commonAncestorContainer } = trimmedRange;

				const cachedStart = trimFromStart && offsetsCache.get(start);
				const cachedEnd = trimFromEnd && offsetsCache.get(end);

				const walker = this.document.createTreeWalker(
					commonAncestorContainer,
					NodeFilter.SHOW_TEXT,
				);

				if (cachedStart) {
					trimmedRange.setStart(cachedStart.node, cachedStart.offset);
				} else if (trimFromStart) {
					if (commonAncestorContainer.nodeType === Node.TEXT_NODE) {
						const node = commonAncestorContainer as globalThis.Text;
						const startOffset = trimmedRange.startOffset + trimFromStart;
						trimmedRange.setStart(node, startOffset);
						offsetsCache.set(start, { node, offset: startOffset });
					} else {
						let charCount = -trimmedRange.startOffset;

						while (walker.nextNode()) {
							const node = walker.currentNode as globalThis.Text;
							if (!trimmedRange.intersectsNode(node)) {
								continue;
							}

							const totalWithNode = charCount + node.length;

							if (totalWithNode >= trimFromStart) {
								const offset = trimFromStart - charCount;
								offsetsCache.set(start, { node, offset });
								trimmedRange.setStart(node, offset);
								break;
							}

							charCount = totalWithNode;
						}
					}
				}

				if (cachedEnd) {
					trimmedRange.setEnd(cachedEnd.node, cachedEnd.offset);
				} else if (trimFromEnd) {
					if (commonAncestorContainer.nodeType === Node.TEXT_NODE) {
						const node = commonAncestorContainer as globalThis.Text;
						const endOffset = trimmedRange.endOffset - trimFromEnd;
						trimmedRange.setEnd(node, endOffset);
						offsetsCache.set(end, { node, offset: endOffset });
					} else {
						let lastChild = lastChildCache.get(commonAncestorContainer) ?? null;

						if (lastChild) {
							walker.currentNode = lastChild;
						} else {
							walker.currentNode = commonAncestorContainer;
							lastChild = walker.lastChild();

							if (!lastChild) {
								return trimmedRange;
							}

							lastChildCache.set(commonAncestorContainer, lastChild);
						}

						let totalWithNode = -(
							trimmedRange.endContainer.textContent!.length -
							trimmedRange.endOffset
						);

						do {
							const node = walker.currentNode as globalThis.Text;
							if (!trimmedRange.intersectsNode(node)) {
								continue;
							}

							totalWithNode += node.length;

							if (totalWithNode >= trimFromEnd) {
								const offset = totalWithNode - trimFromEnd;
								offsetsCache.set(end, { node, offset });
								trimmedRange.setEnd(node, offset);
								break;
							}
						} while (walker.previousNode());
					}
				}

				return trimmedRange;
			});
		};
	}

	/**
	 * The childNodes with the computed offsets
	 */
	get childNodesOffsets() {
		let childNodeOffset = 0;

		return this.childNodes.map((childNode) => {
			const length = childNode.toString().length;
			const offset = {
				childNode,
				start: childNodeOffset,
				end: childNodeOffset + length,
			};
			childNodeOffset += length;
			return offset;
		});
	}

	getRangeOffsets(ranges: Range[] | Range, startPosition = 0) {
		const nodes = new Set(Array.isArray(ranges) ? ranges : [ranges]);

		const childNodesOffsets = this.childNodesOffsets.filter(
			({ childNode }) => typeof childNode !== "string" && nodes.has(childNode),
		);

		const start = (childNodesOffsets.at(0)?.start ?? 0) + startPosition;
		const end = (childNodesOffsets.at(-1)?.end ?? 0) + startPosition;

		return { start, end };
	}

	toString() {
		return this.innerText;
	}
}

export function preserveOptimizeRects<T = DOMRect, K extends any[] = [number]>(
	rects: DOMRect[],
	create?: (rect: DOMRect, indexes: number[], ...key: K) => T,
	getKey?: (rect: DOMRect, index: number) => K[0] | K | null,
): T[];
export function preserveOptimizeRects<T = DOMRect, K extends any[] = [number]>(
	rects: DOMRect[][],
	create?: (
		rect: DOMRect,
		indexes: [index1: number, index2: number][],
		...key: K
	) => T,
	getKey?: (rect: DOMRect, index1: number, index2: number) => K[0] | K | null,
): T[][];
export function preserveOptimizeRects(
	rects: DOMRect[] | DOMRect[][],
	create?: (rect: DOMRect, ...args: any[]) => any,
	getKey?: (rect: DOMRect, ...args: any[]) => any,
): any[] {
	const rectsArray = (Array.isArray(rects[0]) ? rects : [rects]) as DOMRect[][];
	const isFlat = !Array.isArray(rects[0]);

	const TOLERANCE = 1;

	const inputRectsIndexes = new Map(
		rectsArray.flatMap((rectGroup, groupIndex) => {
			return rectGroup.map((rect, rectIndex) => {
				return [
					rect,
					isFlat ? ([rectIndex] as const) : ([groupIndex, rectIndex] as const),
				] as const;
			});
		}),
	);

	const keyArrays = new Map<Map<any, any>, any[]>();
	const cachedKey = new Map<any, any>();
	const keys = new Map<DOMRect, any>();

	if (getKey) {
		for (const rect of rectsArray.flat()) {
			const indexes = inputRectsIndexes.get(rect)!;
			let rawKeysArray = getKey(rect, ...indexes);
			if (rawKeysArray == null) {
				continue;
			}

			if (!Array.isArray(rawKeysArray)) {
				rawKeysArray = [rawKeysArray];
			}

			if (rawKeysArray.length === 0) {
				continue;
			}

			let keyReference = cachedKey;

			for (const key of rawKeysArray) {
				if (!keyReference.has(key)) {
					keyReference.set(key, new Map());
				}

				keyReference = keyReference.get(key);
			}

			let keysArrayRef = keyArrays.get(keyReference);
			if (!keysArrayRef) {
				keysArrayRef = [...rawKeysArray];
				keyArrays.set(keyReference, keysArrayRef);
			}

			keys.set(rect, keysArrayRef);
		}
	}

	const optimizedRects = new Map<DOMRect, Set<DOMRect>>();

	for (const inputRect of inputRectsIndexes.keys()) {
		// Try to find existing rectangle to merge with
		const mergeWith = [...optimizedRects.entries()].find(
			([existingRect, [existingInputRect]]) => {
				if (keys.has(inputRect)) {
					return keys.get(inputRect) === keys.get(existingInputRect!);
				}

				const sameHeight =
					Math.abs(existingRect.height - inputRect.height) <= TOLERANCE;
				const sameTop = Math.abs(existingRect.top - inputRect.top) <= TOLERANCE;
				const isAdjacent =
					Math.abs(existingRect.left - inputRect.right) <= TOLERANCE ||
					Math.abs(existingRect.right - inputRect.left) <= TOLERANCE;
				const isOverlapping =
					existingRect.left <= inputRect.right + TOLERANCE &&
					inputRect.left <= existingRect.right + TOLERANCE;
				const rect1ContainsRect2 =
					existingRect.left <= inputRect.left + TOLERANCE &&
					existingRect.right >= inputRect.right - TOLERANCE &&
					existingRect.top <= inputRect.top + TOLERANCE &&
					existingRect.bottom >= inputRect.bottom - TOLERANCE;
				const rect2ContainsRect1 =
					inputRect.left <= existingRect.left + TOLERANCE &&
					inputRect.right >= existingRect.right - TOLERANCE &&
					inputRect.top <= existingRect.top + TOLERANCE &&
					inputRect.bottom >= existingRect.bottom - TOLERANCE;

				return (
					(sameHeight && sameTop && (isAdjacent || isOverlapping)) ||
					rect1ContainsRect2 ||
					rect2ContainsRect1
				);
			},
		);

		if (!mergeWith) {
			optimizedRects.set(inputRect, new Set([inputRect]));
			continue;
		}

		// Create merged rectangle and replace existing one
		const [mergeWithRect, mergedRects] = mergeWith;
		mergedRects.add(inputRect);

		const top = Math.min(mergeWithRect.top, inputRect.top);
		const left = Math.min(mergeWithRect.left, inputRect.left);
		const bottom = Math.max(mergeWithRect.bottom, inputRect.bottom);
		const right = Math.max(mergeWithRect.right, inputRect.right);

		const newMergedRect = new DOMRect(left, top, right - left, bottom - top);

		optimizedRects.delete(mergeWithRect);
		optimizedRects.set(newMergedRect, mergedRects);
	}

	// Transform the optimized rects if a creator function is provided
	const transformed = new Map(
		[...optimizedRects.entries()].flatMap(([optimized, [...inputRects]]) => {
			let transformed = optimized;
			if (create) {
				const key = keys.get(inputRects[0]!) ?? [];
				const indexes = inputRects.map((inputRect) => {
					const index = inputRectsIndexes.get(inputRect)!;

					return isFlat ? index[0] : index;
				});

				transformed = create(optimized, indexes, ...key);
			}

			return inputRects.map((inputRect) => {
				return [inputRect, transformed] as const;
			});
		}),
	);

	// Reconstruct the original array structure with optimized/transformed rects
	const result = rectsArray.map((rectGroup) =>
		rectGroup.map((rect) => transformed.get(rect)!),
	);

	return isFlat ? (result[0] ?? []) : result;
}

export function optimizeRects<T = DOMRect, K extends any[] = [number]>(
	rects: DOMRect[],
	create?: (rect: DOMRect, indexes: number[], ...key: K) => T,
	getKey?: (rect: DOMRect, index: number) => K[0] | K | null,
): T[];
export function optimizeRects<T = DOMRect, K extends any[] = [number]>(
	rects: DOMRect[][],
	create?: (
		rect: DOMRect,
		indexes: [index1: number, index2: number][],
		...key: K
	) => T,
	getKey?: (rect: DOMRect, index1: number, index2: number) => K[0] | K | null,
): T[];
export function optimizeRects(
	rects: DOMRect[] | DOMRect[][],
	create?: (rect: DOMRect, ...args: any[]) => any,
	getKey?: (rect: DOMRect, ...args: any[]) => any,
): any[] {
	const optimized = preserveOptimizeRects(rects as any, create, getKey);

	return [
		...new Set(
			Array.isArray(optimized[0])
				? (optimized as any[][]).flat()
				: (optimized as any[]),
		),
	];
}
