import { TextLines } from "./TextLines.js";

export function scanLines(element: HTMLElement) {
	return new TextLines(window, element);
}

export function extractLines(element: HTMLElement) {
	const textLines = scanLines(element);

	textLines.dispose();

	return textLines.lines;
}

export function extractRangesFromLines(element: HTMLElement) {
	const lines = extractLines(element);

	return lines.map((line) => line.ranges);
}

export function extractTextFromLines(
	element: HTMLElement,
	includeNewlines = false,
) {
	const lines = extractLines(element);

	return lines.map((line) =>
		includeNewlines ? line.innerText : line.textContent,
	);
}
