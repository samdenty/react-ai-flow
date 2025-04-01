import type { TextLines } from "./TextLines.js";
import type { TextLine } from "./TextLine.js";
import { Box, type BoxParent } from "./Box.js";
import { optimizeRects } from "./utils/optimizeRects.js";

export type RangesChildNode = Range | string;

export interface Ranges<T extends Box, Parent extends BoxParent = BoxParent>
	extends Box<Parent> {
	ranges: Range[];
	textContent: string;
	innerText: string;
	text: TextLines;
	uniqueBoxes: T[];
	boxes: T[][];

	get lines(): TextLine[] | undefined;

	get parent(): Parent;
	set parent(parent: Parent);

	childText: string[];
	childNodes: readonly RangesChildNode[];
	childNodesOffsets: {
		childNode: RangesChildNode;
		start: number;
		end: number;
	}[];

	rescan(): void;
	scanRanges(): DOMRect[][];

	scanBounds(
		rects: { top: number; left: number; bottom: number; right: number }[][],
	): { top: number; left: number; bottom: number; right: number };
	updateBounds(rects?: DOMRect[][]): boolean;

	scanBoxes(rects: DOMRect[][]): T[][];
	updateBoxes(rects?: DOMRect[][]): void;

	comparePosition(other: Ranges<any, any>): number;
	getRangeOffsets(
		ranges: Range[] | Range,
		startPosition?: number,
	): { start: number; end: number };
	combineAdjoining(ranges: (Range | undefined | null)[]): Range[];
	createChildNodeTrimmer(): (start: number, end: number) => RangesChildNode[];
	toString(): string;
}

const constructors: any[] = [];

export function createRanges<BoxType>(
	BaseBox: abstract new (...args: any[]) => BoxType,
): new <T extends Box, Parent extends BoxParent = BoxParent>(
	parent: Parent,
	options: object,
	element: HTMLElement,
	childNodes?: RangesChildNode[],
) => Ranges<T, Parent> & BoxType {
	const Base = BaseBox as any as typeof Box;

	abstract class Ranges<T extends Box, Parent extends BoxParent = BoxParent>
		extends Base<Parent>
		implements Ranges<T, Parent>
	{
		static [Symbol.hasInstance](value: any) {
			return constructors.some((Ranges) =>
				Function.prototype[Symbol.hasInstance].call(Ranges, value),
			);
		}

		#childNodes: readonly RangesChildNode[] = [];
		#boundaryPointsCheck = new WeakMap<
			Node,
			Map<number, WeakMap<Node, Map<number, number>>>
		>();
		ranges: Range[] = [];
		continuousRanges: Range[] = [];

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

		abstract text: TextLines;

		boxes: T[][] = [];
		uniqueBoxes: T[] = [];

		get lines(): TextLine[] | undefined {
			return undefined;
		}

		constructor(
			parent: Parent,
			options: object,
			element: HTMLElement,
			childNodes?: RangesChildNode[],
		) {
			super(parent, options, element);

			if (childNodes) {
				this.childNodes = childNodes;
			}
		}

		dispose() {
			super.dispose();

			this.uniqueBoxes.forEach((box) => box.dispose());
		}

		comparePosition(other: Ranges<any, any>): number {
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
				this.#boundaryPointsCheck.set(
					otherRange.startContainer,
					startPositions,
				);
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

			const overlapping = !(
				this.bottom <= other.top || this.top >= other.bottom
			);

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
				} else if (firstBox && otherFirstBox) {
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

			endPositions.set(otherRange.endOffset, result);

			return result;
		}

		childText: string[] = [];

		set childNodes(childNodes: RangesChildNode[]) {
			this.#childNodes = Object.freeze([...childNodes]);

			this.childText = this.#childNodes.map((childNode) =>
				childNode.toString(),
			);
			this.innerText = this.childText.join("");

			this.textContent = this.childText
				.filter((_, i) => typeof this.#childNodes[i] !== "string")
				.join("");

			this.ranges = this.childNodes.filter(
				(content) => typeof content !== "string",
			);
			this.continuousRanges = this.combineAdjoining(this.ranges);

			this.rescan();
		}

		rescan() {
			const rects = this.scanRanges();
			this.updateBounds(rects);
			this.updateBoxes(rects);
		}

		updateBoxes(rects = this.scanRanges()) {
			this.uniqueBoxes.forEach((box) => box.dispose());
			this.boxes = this.scanBoxes(rects);
			this.uniqueBoxes = [...new Set(this.boxes.flat())];
		}

		get childNodes(): readonly RangesChildNode[] {
			return this.#childNodes;
		}

		updateBounds(rects?: DOMRect[][]): boolean {
			const bounds = this.scanBounds(rects);

			const changed =
				bounds.top !== this.top ||
				bounds.left !== this.left ||
				bounds.bottom !== this.bottom ||
				bounds.right !== this.right;

			Object.assign(this, bounds);

			return changed;
		}

		combineAdjoining(ranges: (Range | undefined | null)[]): Range[] {
			ranges = ranges.filter(Boolean) as Range[];

			if (!ranges.length) {
				return [];
			}

			const mergedRanges = [ranges[0]!.cloneRange()];

			for (let i = 1; i < ranges.length; i++) {
				const currentRange = ranges[i]!;
				const lastMergedRange = mergedRanges[mergedRanges.length - 1]!;
				const potentialMergedRange = lastMergedRange.cloneRange();

				potentialMergedRange.setEnd(
					currentRange.endContainer,
					currentRange.endOffset,
				);

				if (`${potentialMergedRange}` === `${lastMergedRange}${currentRange}`) {
					mergedRanges[mergedRanges.length - 1] = potentialMergedRange;
				} else {
					mergedRanges.push(currentRange.cloneRange());
				}
			}

			return mergedRanges;
		}

		scanBounds(
			rects?: {
				top: number;
				left: number;
				bottom: number;
				right: number;
			}[][],
		) {
			if (!rects) {
				return Box.getBounds(
					this.continuousRanges.map((range) => range.getBoundingClientRect()),
				);
			}

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
							let lastChild =
								lastChildCache.get(commonAncestorContainer) ?? null;

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
				({ childNode }) =>
					typeof childNode !== "string" && nodes.has(childNode),
			);

			const start = (childNodesOffsets.at(0)?.start ?? 0) + startPosition;
			const end = (childNodesOffsets.at(-1)?.end ?? 0) + startPosition;

			return { start, end };
		}

		toString() {
			return this.innerText;
		}
	}

	constructors.push(Ranges);

	return Ranges as any;
}

export const Ranges = createRanges(Box);
