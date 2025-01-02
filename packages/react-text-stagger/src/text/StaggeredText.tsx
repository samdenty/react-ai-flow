import { useRef, useEffect, useMemo, useCallback } from "react";
import { useStagger } from "../stagger/StaggerProvider.js";
import { updateProperty } from "./styles.js";
import { TextSplitterOptions } from "./TextSplitter.js";
import { StaggerElement } from "../element/StaggerElement.js";

export interface StaggeredTextProps extends TextSplitterOptions {
  children: React.ReactNode;
  onStreamStart?: () => void;
  onStreamEnd?: () => void;

  /**
   * Use a background-image instead of mask-image,
   * to debug rectangles
   */
  visualDebug?: boolean;
}

enum CanvasMaskRenderMode {
  PaintWorklet = "houdini-paint-worklet",
  MozElement = "-moz-element",
  WebkitCanvas = "-webkit-canvas",
  DataUri = "data-uri",
}

let paintWorkletRegistered!: Promise<void>;
let ID = 0;

export function StaggeredText(props: StaggeredTextProps) {
  const { children, onStreamStart, onStreamEnd, visualDebug, ...textSplitter } =
    props;

  const id = useMemo(() => ID++, []);
  const className = `staggered-text-${id}`;
  const ref = useRef<HTMLDivElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stagger = useStagger();
  const animationRef = useRef<number | null>(null);
  const state = useMemo<AnimationState>(
    () => ({
      fullRender: true,
      elements: [],
      currentElement: 0,
      width: 0,
      height: 0,
    }),
    []
  );

  const mode = getCanvasRenderingMode();

  const updateSize = useCallback((width: number, height: number) => {
    state.width = width;
    state.height = height;
    state.fullRender = true;

    if (canvasRef.current) {
      stagger.skipMutation(ref.current!);
      canvasRef.current.width = width;
      canvasRef.current.height = height;
    }

    if (mode === CanvasMaskRenderMode.WebkitCanvas) {
      contextRef.current = document.getCSSCanvasContext?.(
        "2d",
        className,
        width,
        height
      );
    }
  }, []);

  const requestPaint = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    animationRef.current = requestAnimationFrame(() => {
      paint();
    });
  }, []);

  const paint = useCallback(() => {
    if (state.currentElement < state.elements.length) {
      const element = state.elements[state.currentElement];
      const newProgress = Math.min(1, Math.max(0, element.progress + 0.01));
      element.progress = newProgress;

      if (newProgress === 1) {
        if (state.currentElement === state.elements.length - 1) {
          element.progress = 1;
        } else {
          element.progress = 0;
          state.currentElement++;
        }
      }
    }

    const canvas = canvasRef.current;

    // console.time(`render ${mode} ` + stateRef.current.elements.length);

    if (mode === CanvasMaskRenderMode.PaintWorklet) {
      updateProperty(className, "--state", JSON.stringify(state));
    }

    contextRef.current ??= canvas?.getContext("2d", {
      willReadFrequently: true,
      alpha: true,
    });

    if (contextRef.current) {
      doPaint(contextRef.current, state);
      state.fullRender = false;
    }

    if (canvas && !visualDebug && mode === CanvasMaskRenderMode.DataUri) {
      updateProperty(
        className,
        "mask-image",
        `url(${canvas.toDataURL("image/png", 0)})`
      );
    }

    // console.timeEnd(`render ${mode} ` + stateRef.current.elements.length);

    requestPaint();
  }, []);

  useEffect(
    () => {
      if (visualDebug) {
        updateProperty(className, "position", "relative");
      } else if (mode === CanvasMaskRenderMode.DataUri) {
        updateProperty(className, "will-change", "mask-image");
      } else {
        updateProperty(
          className,
          "mask-image",
          {
            [CanvasMaskRenderMode.PaintWorklet]: `paint(staggered-text)`,
            [CanvasMaskRenderMode.MozElement]: `-moz-element(#${className})`,
            [CanvasMaskRenderMode.WebkitCanvas]: `-webkit-canvas(${className})`,
          }[mode]
        );
      }

      const { text, dispose } = stagger.observeText(
        ref.current!,
        id,
        textSplitter,
        (event) => {
          if (event.type === "resize") {
            const [{ contentRect }] = event.entries;
            updateSize(contentRect.width, contentRect.height);
          }

          // console.log(
          //   "elements",
          //   text.elements.map((a) => a.computedTextContent)
          // );

          state.elements = text.elements;

          paint();
        }
      );

      return dispose;
    },
    [
      // textSplitter.animation,
      // textSplitter.gradientWidth,
      // textSplitter.delay,
      // textSplitter.duration,
      // textSplitter.splitter,
    ]
  );

  return (
    <div ref={ref} className={className}>
      {visualDebug ||
      mode === CanvasMaskRenderMode.DataUri ||
      mode === CanvasMaskRenderMode.MozElement ? (
        <canvas
          ref={canvasRef}
          style={
            visualDebug
              ? { opacity: 0.5, position: "absolute", pointerEvents: "none" }
              : { display: "none" }
          }
          id={mode === CanvasMaskRenderMode.MozElement ? className : undefined}
        ></canvas>
      ) : null}

      {children}
    </div>
  );
}

interface AnimationState {
  fullRender: boolean;
  currentElement: number;
  elements: StaggerElement[];
  width: number;
  height: number;
}

function doPaint(
  ctx: CanvasRenderingContext2D | PaintRenderingContext2D,
  state: AnimationState
) {
  ctx.fillStyle = "#000000";
  ctx.globalAlpha = 1;

  if (state.fullRender) {
    ctx.clearRect(0, 0, state.width, state.height);

    for (let i = 0; i < state.currentElement; i++) {
      for (const box of state.elements[i].boxes) {
        ctx.fillRect(box.left, box.top, box.width, box.height);
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

        gradient.addColorStop(startGradientPercent, "#000000");
        gradient.addColorStop(endGradientPercent, "rgba(0, 0, 0, 0)");
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

        ctx.fillStyle = gradient;
        ctx.fillRect(left, top, width, height);
      }
    }
  }
}

function paintWorklet() {
  globalThis.registerPaint(
    "staggered-text",
    class PaintWorklet {
      static get inputProperties() {
        return ["--state"];
      }

      paint(
        ctx: PaintRenderingContext2D,
        _geometry: PaintSize,
        properties: PaintStylePropertyMapReadOnly
      ) {
        const state = JSON.parse(properties.get("--state").toString());
        doPaint(ctx, state);
      }
    }
  );
}

if (CSS.paintWorklet) {
  try {
    const workletBlob = new Blob(
      [`const doPaint = (${doPaint});\n(${paintWorklet})();`],
      {
        type: "text/javascript",
      }
    );

    const workletUrl = URL.createObjectURL(workletBlob);

    paintWorkletRegistered = CSS.paintWorklet
      .addModule(workletUrl)
      .then(() => URL.revokeObjectURL(workletUrl));
  } catch (error) {
    console.error("Failed to register paint worklet:", error);
  }
}

function getCanvasRenderingMode() {
  // return CanvasMaskRenderMode.DataUri;

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
