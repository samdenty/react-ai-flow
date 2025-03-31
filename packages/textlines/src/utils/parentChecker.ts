import type { TextLines } from "../TextLines.js";

export function createParentChecker(text: TextLines) {
	const styleCache = new WeakMap<HTMLElement, CSSStyleDeclaration>();
	const blockParentCache = new WeakMap<Element, HTMLElement | null>();

	return function checkNodeParents(textNode: globalThis.Text) {
		const element = textNode.parentElement ?? text.document.body;

		let blockParent: HTMLElement | null = null;
		let parent: HTMLElement = element;
		let style: CSSStyleDeclaration;
		let subtext: TextLines | null = null;

		do {
			// Check if parent is hidden
			let parentStyle = styleCache.get(parent);
			if (parentStyle == null) {
				parentStyle = text.window.getComputedStyle(parent);
				styleCache.set(parent, parentStyle);
			}

			style ??= parentStyle;

			let hidden =
				parentStyle.display === "none" ||
				parentStyle.visibility === "hidden" ||
				(parent.offsetParent === null &&
					parent !== text.document.body &&
					parent !== text.document.documentElement);

			hidden ||= text.texts.some((text) => {
				return text.isIgnoredNode(element, false);
			});

			if (hidden) {
				return {
					isHidden: true,
					subtext,
					blockParent: null,
					style: null,
					parent: null,
				} as const;
			}

			subtext =
				text.nextTexts.find((text) => text.container === parent) ?? subtext;

			// Check if it's a block parent (if we haven't found one yet)
			if (
				(!blockParent && parentStyle.display === "block") ||
				parentStyle.display === "list-item" ||
				parentStyle.display === "table"
			) {
				blockParent = parent;
			}

			blockParentCache.set(parent, blockParent);
		} while (parent.parentElement && (parent = parent.parentElement));

		blockParent ??= text.document.body;

		return {
			isHidden: false,
			subtext,
			blockParent,
			style,
			element,
		} as const;
	};
}
