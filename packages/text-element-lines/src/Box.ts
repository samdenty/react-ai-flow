import { Ranges } from "./Ranges.js";

export interface BoxParent {
	window?: Window & typeof globalThis;
}

export class Box<Parent extends BoxParent = BoxParent> implements BoxParent {
	#disposers = new Set<VoidFunction>();
	#container!: HTMLElement;

	#parentRanges?: Ranges<any, any>;
	#parentLeft = 0;
	#parentTop = 0;
	#rectListeners = new Set<() => void>();

	get container(): HTMLElement {
		return this.#container;
	}

	set container(container: HTMLElement | undefined) {
		if (!container) {
			return;
		}

		this.#container = container;
	}

	updateParentCoords = () => {
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

	containedWithin(other: Box) {
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

	#parent: Parent;

	get parent() {
		return this.#parent;
	}

	set parent(parent: Parent) {
		this.#parent = parent;
	}

	constructor(
		parent: Parent,
		public options: object,
		element: HTMLElement,
		public relativeTopToParent = 0,
		public relativeLeftToParent = 0,
		public width = 0,
		public height = 0,
	) {
		this.#parent = parent;

		if (parent instanceof Ranges) {
			this.#parentRanges = parent;

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
		}

		this.window = this.parent.window ?? window;

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
		return this.relativeTo(this.#parentRanges);
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
		to?:
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
		other?:
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
