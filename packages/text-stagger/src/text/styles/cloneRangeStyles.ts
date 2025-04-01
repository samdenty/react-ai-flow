const COPY_STYLES = [
	"color",
	"font-family",
	"font-size",
	"font-style",
	"font-weight",
	"letter-spacing",
	"line-height",
	"text-align",
	"text-decoration",
	"text-transform",
	"white-space",
	"word-spacing",
	"margin",
	"padding",
	"border-width",
	"border-style",
	"border-color",
	"display",
	"opacity",
] as const;

export function cloneRangeWithStyles(
	window: Window & typeof globalThis,
	range: Range,
	target: HTMLElement,
	onElement?: (element: HTMLElement) => void,
) {
	// Get the common ancestor container
	const ancestorContainer = range.commonAncestorContainer;

	// If the container is a text node, get its parent
	const contextElement =
		ancestorContainer.nodeType === Node.TEXT_NODE
			? ancestorContainer.parentElement
			: (ancestorContainer as Element);

	// Clone the range contents
	const clonedContent = range.cloneContents();

	target.appendChild(clonedContent);

	function transferComputedStyles(
		style: CSSStyleDeclaration,
		targetElement: HTMLElement,
	) {
		onElement?.(targetElement);

		const targetStyle = window.getComputedStyle(targetElement);
		const batchedStyles: string[] = [];

		for (const prop of COPY_STYLES) {
			const value = style.getPropertyValue(prop);
			if (value !== targetStyle.getPropertyValue(prop)) {
				batchedStyles.push(`${prop}: ${value}`);
			}
		}

		targetElement.style += batchedStyles.join(";");
	}

	// Helper function to copy computed styles to an element
	function copyComputedStyles(
		sourceElement: Element,
		targetElement: HTMLElement,
	) {
		targetElement.classList.remove(...sourceElement.classList);

		const style = window.getComputedStyle(sourceElement);

		transferComputedStyles(style, targetElement);

		// Handle pseudo-elements if needed
		const beforeStyle = window.getComputedStyle(sourceElement, ":before");
		const afterStyle = window.getComputedStyle(sourceElement, ":after");

		if (beforeStyle.content !== "none") {
			const targetBefore = window.document.createElement("span");
			targetElement.insertBefore(targetBefore, targetElement.firstChild);

			transferComputedStyles(beforeStyle, targetBefore);
		}

		if (afterStyle.content !== "none") {
			const targetAfter = window.document.createElement("span");
			targetElement.appendChild(targetAfter);

			transferComputedStyles(afterStyle, targetAfter);
		}
	}

	// Copy styles from ancestor if it's an element
	if (contextElement instanceof window.HTMLElement) {
		copyComputedStyles(contextElement, target);

		// Process all elements in the cloned content
		const walker = window.document.createTreeWalker(
			clonedContent,
			NodeFilter.SHOW_ELEMENT,
			null,
		);

		let currentNode = walker.nextNode();
		while (currentNode) {
			const sourceElement = window.document.querySelector(
				generateSelector(currentNode as HTMLElement),
			);
			if (sourceElement) {
				copyComputedStyles(sourceElement, currentNode as HTMLElement);
			}
			currentNode = walker.nextNode();
		}
	}
}

// Helper function to generate a unique selector for an element
function generateSelector(element: HTMLElement): string {
	if (element.id) {
		return `#${element.id}`;
	}

	const path = [];
	let current: HTMLElement | null = element;

	while (current) {
		let selector = current.tagName.toLowerCase();
		if (current.className) {
			selector += `.${Array.from(current.classList).join(".")}`;
		}

		// Add nth-child if needed
		const parent = current.parentElement;
		if (parent) {
			const siblings = Array.from(parent.children);
			const index = siblings.indexOf(current) + 1;
			if (siblings.filter((s) => s.tagName === current!.tagName).length > 1) {
				selector += `:nth-child(${index})`;
			}
		}

		path.unshift(selector);
		current = current.parentElement;
	}

	return path.join(" > ");
}
