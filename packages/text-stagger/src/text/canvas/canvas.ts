import type { SerializedText } from "../Text.js";

export enum CanvasMaskRenderMode {
	PaintWorkletArg = "houdini-paint-worklet-with-arg",
	PaintWorkletCssVar = "houdini-paint-worklet-with-css-var",
	MozElement = "-moz-element",
	WebkitCanvas = "-webkit-canvas",
	DataUri = "data-uri",
}

let maskRenderMode = getOptimalRenderingMode();

export function doPaint(
	ctx: CanvasRenderingContext2D | PaintRenderingContext2D,
	text: SerializedText,
) {
	const fill = `rgba(0, 0, 0, ${text.visualDebug ? 0.75 : 1})`;
	const surroundingFill = text.visualDebug
		? "rgba(0, 0, 255, 0.4)"
		: "rgba(0, 0, 0, 1)";

	if (!text.elements.length) {
		return;
	}

	ctx.clearRect(0, 0, text.canvasRect.width, text.canvasRect.height);

	const boxes = text.elements.flatMap((element) => {
		const { fadeIn, gradientReveal } = element;

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
				fadeIn,
				gradientReveal,
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
		fadeIn,
		parentText,
	} of boxes) {
		if (parentText) {
			continue;
		}

		ctx.globalAlpha = fadeIn ? timing : Math.min(1, timing / 0.4);

		// Fill everything to the left of the box
		ctx.fillRect(0, top, left, height);

		// Fill everything above the boxs
		ctx.fillRect(0, 0, text.canvasRect.width, top);

		if (isLast && !text.streaming) {
			ctx.globalAlpha = fadeIn ? timing : Math.max(0, (timing - 0.6) / 0.4);

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
		fadeIn,
		gradientReveal,
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

		if (fadeIn || timing === 1) {
			ctx.globalAlpha = timing;
			ctx.fillRect(left, top, width, height);
		} else if (
			(gradientReveal === "right" ||
				gradientReveal === "down" ||
				gradientReveal === "left" ||
				gradientReveal === "up") &&
			width > 0 &&
			height > 0 &&
			timing > 0
		) {
			ctx.globalAlpha = 1;

			const gradientGutterOverflow = gradientWidth / 2;
			const isHorizontal =
				gradientReveal === "right" || gradientReveal === "left";
			const isReverse = gradientReveal === "left" || gradientReveal === "up";
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

function getOptimalRenderingMode(): CanvasMaskRenderMode {
	if (globalThis.CSS?.paintWorklet) {
		if (CSS.supports("mask-image", 'paint(foo, "")')) {
			return CanvasMaskRenderMode.PaintWorkletArg;
		}

		return CanvasMaskRenderMode.PaintWorkletCssVar;
	}

	if (globalThis.document?.getCSSCanvasContext) {
		return CanvasMaskRenderMode.WebkitCanvas;
	}

	if (globalThis.document?.mozSetImageElement) {
		return CanvasMaskRenderMode.MozElement;
	}

	return CanvasMaskRenderMode.DataUri;
}

const listeners = new Set<(mode: CanvasMaskRenderMode) => void>();

export function getRenderingMode(
	listener: (mode: CanvasMaskRenderMode) => void,
): VoidFunction;
export function getRenderingMode(): CanvasMaskRenderMode;
export function getRenderingMode(
	listener?: (mode: CanvasMaskRenderMode) => void,
) {
	if (!listener) {
		return maskRenderMode;
	}

	listeners.add(listener);

	listener(maskRenderMode);

	return () => {
		listeners.delete(listener);
	};
}

export function enableDataUriRendering(enabled: boolean) {
	const previousMode = maskRenderMode;
	if (enabled) {
		maskRenderMode = CanvasMaskRenderMode.DataUri;
	} else {
		maskRenderMode = getOptimalRenderingMode();
	}

	if (previousMode !== maskRenderMode) {
		listeners.forEach((listener) => listener(maskRenderMode));
	}
}
