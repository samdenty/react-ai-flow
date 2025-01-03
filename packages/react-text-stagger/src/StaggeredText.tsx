import { useRef, useEffect, useMemo, useCallback } from "react";
import { useStagger } from "./StaggerProvider.js";
import { updateProperty } from "./utils/styles.js";
import {
  TextSplitterOptions,
  maskRenderMode,
  CanvasMaskRenderMode,
  doPaint,
  AnimationState,
} from "text-stagger";

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

  const updateSize = useCallback(
    (width: number, height: number) => {
      state.width = width;
      state.height = height;
      state.fullRender = true;

      if (canvasRef.current) {
        stagger.skipMutation(ref.current!);
        canvasRef.current.width = width;
        canvasRef.current.height = height;
      }

      if (
        !visualDebug &&
        maskRenderMode === CanvasMaskRenderMode.WebkitCanvas
      ) {
        contextRef.current = document.getCSSCanvasContext?.(
          "2d",
          className,
          width,
          height
        );
      }
    },
    [visualDebug]
  );

  const paint = useCallback(() => {
    if (state.currentElement < state.elements.length) {
      const element = state.elements[state.currentElement];
      const newProgress = Math.min(1, Math.max(0, element.progress + 0.025));
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

    if (maskRenderMode === CanvasMaskRenderMode.PaintWorklet) {
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

    if (
      canvas &&
      !visualDebug &&
      maskRenderMode === CanvasMaskRenderMode.DataUri
    ) {
      updateProperty(
        className,
        "mask-image",
        `url(${canvas.toDataURL("image/png", 0)})`
      );
    }

    requestPaint();
  }, [visualDebug]);

  const requestPaint = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    animationRef.current = requestAnimationFrame(() => {
      paint();
    });
  }, [paint]);

  useEffect(() => {
    if (visualDebug) {
      updateProperty(className, "mask-image", null);
      updateProperty(className, "position", "relative");
    } else if (maskRenderMode === CanvasMaskRenderMode.DataUri) {
      updateProperty(className, "will-change", "mask-image");
    } else {
      updateProperty(className, "position", null);
      updateProperty(
        className,
        "mask-image",
        {
          [CanvasMaskRenderMode.PaintWorklet]: `paint(staggered-text)`,
          [CanvasMaskRenderMode.MozElement]: `-moz-element(#${className})`,
          [CanvasMaskRenderMode.WebkitCanvas]: `-webkit-canvas(${className})`,
        }[maskRenderMode]
      );
    }

    const { text, dispose } = stagger.observeText(
      ref.current!,
      id,
      textSplitter,
      (event) => {
        if (event.reason === "resize") {
          const [{ contentRect }] = event.entries;
          updateSize(contentRect.width, contentRect.height);
        }

        console.log(
          "elements",
          text.elements.map((a) => a.innerText)
        );

        state.elements = text.elements;

        paint();
      }
    );

    return dispose;
  }, [visualDebug]);

  return (
    <div ref={ref} className={className}>
      {visualDebug ||
      maskRenderMode === CanvasMaskRenderMode.DataUri ||
      maskRenderMode === CanvasMaskRenderMode.MozElement ? (
        <canvas
          ref={canvasRef}
          style={
            visualDebug
              ? { opacity: 0.5, position: "absolute", pointerEvents: "none" }
              : { display: "none" }
          }
          id={
            maskRenderMode === CanvasMaskRenderMode.MozElement
              ? className
              : undefined
          }
        ></canvas>
      ) : null}

      {children}
    </div>
  );
}
