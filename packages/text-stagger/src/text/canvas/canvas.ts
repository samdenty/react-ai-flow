import { type SerializedText } from "../Text.js";
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
  text: SerializedText
) {
  const fill = `rgba(0, 0, 0, ${text.visualDebug ? 0.8 : 1})`;
  const surroundingFill = text.visualDebug
    ? `rgba(0, 0, 255, 0.4)`
    : `rgba(0, 0, 0, 1)`;

  ctx.clearRect(0, 0, text.width, text.height);

  const boxes = text.elements.flatMap((element) => {
    const { animation } = element;

    return element.boxes.map((box) => {
      const { left, top, width, height, progress, gradientWidth } = box;
      const isLast = element.isLast && box.isLast;

      return {
        animation,
        left,
        top,
        width,
        height,
        progress,
        gradientWidth,
        isLast,
      };
    });
  });

  ctx.fillStyle = surroundingFill;

  for (const {
    left,
    width,
    top,
    height,
    progress,
    isLast,
    animation,
  } of boxes) {
    ctx.globalAlpha =
      animation === "fade-in" ? progress : Math.min(1, progress / 0.4);

    // Fill everything to the left of the box
    ctx.fillRect(0, top, left, height);

    // Fill everything above the boxs
    ctx.fillRect(0, 0, text.width, top);

    if (isLast) {
      ctx.globalAlpha =
        animation === "fade-in"
          ? progress
          : Math.max(0, (progress - 0.6) / 0.4);

      // Fill everything to the right of the box
      ctx.fillRect(left + width, top, text.width - left - width, height);

      // Fill everything below the box
      ctx.fillRect(0, top + height, text.width, text.height - top - height);
    }
  }

  // Second pass: Draw the regular boxes
  for (const {
    animation,
    left,
    top,
    width,
    height,
    progress,
    gradientWidth,
  } of boxes) {
    ctx.fillStyle = fill;

    if (animation === "fade-in") {
      ctx.globalAlpha = progress;
      ctx.clearRect(left, top, width, height);
      ctx.fillRect(left, top, width, height);
    } else if (
      (animation === "gradient-right" ||
        animation === "gradient-down" ||
        animation === "gradient-left" ||
        animation === "gradient-up") &&
      width > 0 &&
      height > 0 &&
      progress > 0
    ) {
      ctx.globalAlpha = 1;

      const gradientGutterOverflow = gradientWidth / 2;
      const isHorizontal =
        animation === "gradient-right" || animation === "gradient-left";
      const isReverse =
        animation === "gradient-left" || animation === "gradient-up";
      const size = isHorizontal ? width : height;

      const gradientStart = -gradientGutterOverflow;
      const gradientEnd = size + gradientGutterOverflow;

      const relativeGradientSize = gradientEnd - gradientStart;
      const relativeGradientPercent = gradientWidth / relativeGradientSize;

      const startGradientPercent = Math.max(
        0,
        progress - relativeGradientPercent / 2
      );
      const endGradientPercent = Math.min(
        1,
        progress + relativeGradientPercent / 2
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
    }
  }

  // Final pass: Draw debug rectangles on top
  if (text.visualDebug) {
    for (const { left, top, width, height, progress } of boxes) {
      ctx.globalAlpha = progress === 1 ? 1 : 0.5;
      ctx.strokeStyle = "red";
      ctx.strokeRect(left, top, width, height);
    }
  }
}

function getCanvasRenderingMode(): CanvasMaskRenderMode {
  if (!!paintWorkletRegistered) {
    return CanvasMaskRenderMode.PaintWorklet;
  }

  if (document.getCSSCanvasContext) {
    return CanvasMaskRenderMode.WebkitCanvas;
  }

  if (document.mozSetImageElement) {
    return CanvasMaskRenderMode.MozElement;
  }

  return CanvasMaskRenderMode.DataUri;
}
