import { SerializedText } from "../Text.js";
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
  ctx.clearRect(0, 0, text.width, text.height);

  const boxes = text.elements.flatMap(({ animation, boxes }) => {
    return boxes.map(
      ({ left, top, width, height, progress, gradientWidth = 100 }) => {
        return { animation, left, top, width, height, progress, gradientWidth };
      }
    );
  });

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
      animation === "gradient-reveal" &&
      width > 0 &&
      height > 0 &&
      progress > 0
    ) {
      ctx.globalAlpha = 1;

      // The amount at the start of the end of the gradient
      // to ensure a smooth transition, if this is too big
      // the gradient will be slow to start/end
      const gradientGutterOverflow = gradientWidth / 2;

      const gradientStart = -gradientGutterOverflow;
      const gradientEnd = width + gradientGutterOverflow;

      const relativeGradientWidth = gradientEnd - gradientStart;
      const relativeGradientWidthPercent =
        gradientWidth / relativeGradientWidth;

      const startGradientPercent = Math.max(
        0,
        progress - relativeGradientWidthPercent / 2
      );
      const endGradientPercent = Math.min(
        1,
        progress + relativeGradientWidthPercent / 2
      );

      const gradient = ctx.createLinearGradient(
        left + gradientStart,
        0,
        left + gradientEnd,
        0
      );

      gradient.addColorStop(startGradientPercent, fill);
      gradient.addColorStop(endGradientPercent, "rgba(0, 0, 0, 0)");
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

      ctx.fillStyle = gradient;
      ctx.fillRect(left, top, width, height);
    }

    if (text.visualDebug) {
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
