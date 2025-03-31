import type {
	ElementOptions,
	Stagger,
	StaggerElementBoxOptions,
} from "../stagger/index.js";
import type { Text } from "./Text.js";
import { updateStyles } from "./styles/properties.js";
import { Box as BaseBox, createRanges } from "text-element-lines";

export class Box<
	T extends Ranges<any, any> | Stagger = Ranges<any, any> | Stagger,
> extends BaseBox<T> {
	stagger: Stagger;

	set parent(parent: T) {
		super.parent = parent;
	}

	get parent(): T {
		return super.parent;
	}

	constructor(
		parent: T,
		public options: ElementOptions,
		element: HTMLElement,
		relativeTopToParent = 0,
		relativeLeftToParent = 0,
		width = 0,
		height = 0,
	) {
		super(
			parent,
			options,
			element,
			relativeTopToParent,
			relativeLeftToParent,
			width,
			height,
		);

		if (parent instanceof Ranges) {
			this.stagger = parent.stagger;
		} else {
			this.stagger = parent;
		}
	}
}

const BaseRanges = createRanges(Box);

export type RangesChildNode = Range | string;

export abstract class Ranges<
	T extends Box,
	U extends Ranges<Box, any> | Stagger,
> extends BaseRanges<T, U> {
	abstract text: Text;

	uniqueBoxes: T[] = [];

	updateStyles(
		className: string,
		property: string | null,
		value?: string | null,
	) {
		updateStyles(this.window, className, property, value);
	}

	set parent(parent: U) {
		super.parent = parent;
	}

	get parent(): U {
		return super.parent;
	}

	constructor(
		parent: U,
		public options: StaggerElementBoxOptions,
		element: HTMLElement,
		childNodes?: RangesChildNode[],
	) {
		super(parent, options, element, childNodes);
	}

	updateBounds(rects?: DOMRect[][]): boolean {
		const changed = super.updateBounds(rects);

		if (changed) {
			this.stagger.invalidatePositions();
		}

		return changed;
	}
}
