import type { SerializedText } from "../Text.js";
import { paintWorkletRegistered } from "./paint-worklet.js";

export enum CanvasMaskRenderMode {
	PaintWorklet = "houdini-paint-worklet",
	MozElement = "-moz-element",
	WebkitCanvas = "-webkit-canvas",
	DataUri = "data-uri",
}

export const maskRenderMode = getCanvasRenderingMode();

export function doPaint(
	ctx: CanvasRenderingContext2D | PaintRenderingContext2D,
	text: SerializedText,
) {
	const fill = `rgba(0, 0, 0, ${text.visualDebug ? 0.75 : 1})`;
	const surroundingFill = text.visualDebug
		? "rgba(0, 0, 255, 0.4)"
		: "rgba(0, 0, 0, 1)";

	if (!text.elements.length) {
		if (text.parentText) {
			return;
		}

		ctx.fillStyle = surroundingFill;
		ctx.fillRect(0, 0, text.canvasRect.width, text.canvasRect.height);
		return;
	}

	ctx.clearRect(0, 0, text.canvasRect.width, text.canvasRect.height);

	const boxes = text.elements.flatMap((element) => {
		const { animation } = element;

		return element.uniqueBoxes.map((box) => {
			const {
				relativeToCanvas: { left, top, bottom, right, width, height },
				timing,
				gradientWidth,
				text: { parentText },
				subtext,
			} = box;

			const isLast = element.isLast && box.isLast;

			return {
				animation,
				parentText,
				left,
				top,
				bottom,
				right,
				width,
				height,
				timing,
				gradientWidth,
				isLast,
				subtext,
			};
		});
	});

	ctx.fillStyle = surroundingFill;

	for (const {
		left,
		width,
		top,
		height,
		timing,
		isLast,
		animation,
		parentText,
	} of boxes) {
		if (parentText) {
			continue;
		}

		ctx.globalAlpha =
			animation === "fade-in" ? timing : Math.min(1, timing / 0.4);

		// Fill everything to the left of the box
		ctx.fillRect(0, top, left, height);

		// Fill everything above the boxs
		ctx.fillRect(0, 0, text.canvasRect.width, top);

		if (isLast && !text.streaming) {
			ctx.globalAlpha =
				animation === "fade-in" ? timing : Math.max(0, (timing - 0.6) / 0.4);

			// Fill everything to the right of the box
			ctx.fillRect(
				left + width,
				top,
				text.canvasRect.width - left - width,
				height,
			);

			// Fill everything below the box
			ctx.fillRect(
				0,
				top + height,
				text.canvasRect.width,
				text.canvasRect.height - top - height,
			);
		}
	}

	// draw the boxes so that the stuff on top overlaps
	// stuff on bottom (ie. so it's not clearRect'd away)
	boxes.reverse();

	// Second pass: Draw the regular boxes
	for (const {
		animation,
		subtext,
		left,
		top,
		width,
		height,
		timing,
		gradientWidth,
	} of boxes) {
		if (timing === 0) {
			continue;
		}

		ctx.fillStyle = fill;
		ctx.clearRect(left, top, width, height);

		if (animation === "fade-in" || timing === 1) {
			ctx.globalAlpha = timing;
			ctx.fillRect(left, top, width, height);
		} else if (
			(animation === "gradient-reveal" ||
				animation === "gradient-down" ||
				animation === "gradient-left" ||
				animation === "gradient-up") &&
			width > 0 &&
			height > 0 &&
			timing > 0
		) {
			ctx.globalAlpha = 1;

			const gradientGutterOverflow = gradientWidth / 2;
			const isHorizontal =
				animation === "gradient-reveal" || animation === "gradient-left";
			const isReverse =
				animation === "gradient-left" || animation === "gradient-up";
			const size = isHorizontal ? width : height;

			const gradientStart = -gradientGutterOverflow;
			const gradientEnd = size + gradientGutterOverflow;

			const relativeGradientSize = gradientEnd - gradientStart;
			const relativeGradientPercent = gradientWidth / relativeGradientSize;

			const startGradientPercent = Math.max(
				0,
				timing - relativeGradientPercent / 2,
			);
			const endGradientPercent = Math.min(
				1,
				timing + relativeGradientPercent / 2,
			);

			const [start, end] = isReverse
				? [gradientEnd, gradientStart]
				: [gradientStart, gradientEnd];

			const [x1, y1, x2, y2] = isHorizontal
				? [left + start, 0, left + end, 0]
				: [0, top + start, 0, top + end];

			const gradient = ctx.createLinearGradient(x1, y1, x2, y2);

			gradient.addColorStop(startGradientPercent, fill);
			gradient.addColorStop(endGradientPercent, "rgba(0, 0, 0, 0)");
			gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

			ctx.fillStyle = gradient;
			ctx.fillRect(left, top, width, height);
		} else if (subtext) {
			ctx.globalAlpha = 1;
			ctx.fillRect(left, top, width, height);
		}
	}

	// Final pass: Draw debug rectangles on top
	if (text.visualDebug) {
		for (const { left, top, width, height, timing } of boxes) {
			ctx.globalAlpha = timing === 1 ? 1 : 0.5;
			ctx.strokeStyle = "red";
			ctx.strokeRect(left, top, width, height);
		}
	}
}

function getCanvasRenderingMode(): CanvasMaskRenderMode {
	if (paintWorkletRegistered) {
		return CanvasMaskRenderMode.PaintWorklet;
	}

	if (globalThis.document?.getCSSCanvasContext) {
		return CanvasMaskRenderMode.WebkitCanvas;
	}

	if (globalThis.document?.mozSetImageElement) {
		return CanvasMaskRenderMode.MozElement;
	}

	return CanvasMaskRenderMode.DataUri;
}
