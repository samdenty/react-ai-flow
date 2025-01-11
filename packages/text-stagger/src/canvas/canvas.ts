import { StaggerElement } from "../stagger/index.js";
import { paintWorkletRegistered } from "./paint-worklet.js";

export enum CanvasMaskRenderMode {
  PaintWorklet = "houdini-paint-worklet",
  MozElement = "-moz-element",
  WebkitCanvas = "-webkit-canvas",
  DataUri = "data-uri",
}

export const maskRenderMode = getCanvasRenderingMode();

export interface AnimationState {
  currentElement: number;
  visualDebug: boolean;
  elements: StaggerElement[];
  width: number;
  height: number;
}

export function doPaint(
  ctx: CanvasRenderingContext2D | PaintRenderingContext2D,
  state: AnimationState
) {
  const fill = `rgba(0, 0, 0, ${state.visualDebug ? 0.5 : 1})`;

  ctx.fillStyle = fill;
  ctx.globalAlpha = 1;

  ctx.clearRect(0, 0, state.width, state.height);

  for (let i = 0; i < state.currentElement; i++) {
    for (const box of state.elements[i].boxes) {
      ctx.fillStyle = fill;
      ctx.fillRect(box.left, box.top, box.width, box.height);

      if (state.visualDebug) {
        ctx.strokeStyle = "red";
        ctx.strokeRect(box.left, box.top, box.width, box.height);
      }
    }
  }

  // Draw current line with gradient
  if (state.currentElement < state.elements.length) {
    const element = state.elements[state.currentElement];

    const { animation } = element;

    if (animation === "fade-in") {
      for (const box of element.boxes) {
        ctx.globalAlpha = box.progress;
        ctx.clearRect(box.left, box.top, box.width, box.height);
        ctx.fillRect(box.left, box.top, box.width, box.height);
      }
    }

    if (animation === "gradient-reveal") {
      for (const box of element.boxes) {
        const { left, top, width, height, gradientWidth = 100 } = box;

        if (width <= 0 || height <= 0 || box.progress <= 0) continue;

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
          box.progress - relativeGradientWidthPercent / 2
        );
        const endGradientPercent = Math.min(
          1,
          box.progress + relativeGradientWidthPercent / 2
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
