import {
  useRef,
  useEffect,
  useMemo,
  useCallback,
  createContext,
  useContext,
  useState,
  useImperativeHandle,
} from "react";
import { useStaggerContext } from "./StaggerProvider.js";
import { updateProperty } from "./utils/styles.js";
import {
  maskRenderMode,
  CanvasMaskRenderMode,
  doPaint,
  AnimationState,
  Text,
  TextOptions,
} from "text-stagger";
import { useResolvedOptions } from "./utils/useCachedOptions.js";

export interface StaggeredTextProps extends TextOptions {
  children: React.ReactNode;
}

const StaggeredTextContext = createContext<number | null>(null);

let ID = 0;

export function StaggeredText(props: StaggeredTextProps) {
  const { children, ...restProps } = props;
  const id = useMemo(() => ID++, []);
  const className = `react-text-stagger-${id}`;
  const options = useResolvedOptions(restProps);

  let parentText: number | null = null;
  try {
    parentText = useContext(StaggeredTextContext);
  } catch (e) {
    // ignore
  }

  const ref = useRef<HTMLSpanElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stagger = useStaggerContext();
  const animationRef = useRef<number | null>(null);
  const state = useMemo<AnimationState>(
    () => ({
      elements: [],
      currentElement: 0,
      width: 0,
      height: 0,
      visualDebug: options.visualDebug,
    }),
    []
  );

  const updateSize = useCallback(() => {
    if (!ref.current) {
      return;
    }

    const { width, height } = ref.current.getBoundingClientRect();

    state.width = width;
    state.height = height;

    if (canvasRef.current) {
      stagger.skipMutation(ref.current!);
      canvasRef.current.width = width;
      canvasRef.current.height = height;
    }

    if (
      !options.visualDebug &&
      maskRenderMode === CanvasMaskRenderMode.WebkitCanvas
    ) {
      contextRef.current = document.getCSSCanvasContext?.(
        "2d",
        className,
        width,
        height
      );
    }
  }, [options]);

  const paint = useCallback(() => {
    if (state.currentElement < state.elements.length) {
      const element = state.elements[state.currentElement];
      const newProgress = Math.min(1, Math.max(0, element.progress + 0.1));
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

    if (
      !canvas &&
      !options.visualDebug &&
      maskRenderMode === CanvasMaskRenderMode.DataUri
    ) {
      canvasRef.current = document.createElement("canvas");
    }

    if (
      !options.visualDebug &&
      maskRenderMode === CanvasMaskRenderMode.PaintWorklet
    ) {
      updateProperty(
        className,
        "mask-image",
        `paint(text-stagger, ${JSON.stringify(JSON.stringify(state))})`
      );
    }

    contextRef.current ??= canvas?.getContext("2d", {
      willReadFrequently: true,
      alpha: true,
    });

    if (contextRef.current) {
      doPaint(contextRef.current, state);
    }

    if (
      canvas &&
      !options.visualDebug &&
      maskRenderMode === CanvasMaskRenderMode.DataUri
    ) {
      updateProperty(
        className,
        "mask-image",
        `url(${canvas.toDataURL("image/png", 0)})`
      );
    }

    requestPaint();
  }, [options]);

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
    const element = ref.current;
    if (parentText || !element || options.disabled) {
      return;
    }

    updateProperty(className, "display", "inline-block");

    if (options.visualDebug) {
      updateProperty(className, "mask-image", null);
      updateProperty(className, "position", "relative");
      updateProperty(className, "will-1change", null);
    } else if (
      maskRenderMode === CanvasMaskRenderMode.DataUri ||
      maskRenderMode === CanvasMaskRenderMode.PaintWorklet
    ) {
      updateProperty(className, "will-change", "mask-image");
    } else {
      updateProperty(className, "will-change", null);
      updateProperty(
        className,
        "mask-image",
        {
          [CanvasMaskRenderMode.MozElement]: `-moz-element(#${className})`,
          [CanvasMaskRenderMode.WebkitCanvas]: `-webkit-canvas(${className})`,
        }[maskRenderMode]
      );
    }

    state.visualDebug = options.visualDebug;

    const { text, dispose } = stagger.observeText(
      element,
      id,
      options,
      (event) => {
        if (event.reason === "resize") {
          updateSize();
        }

        console.log(
          "elements",
          text.elements.map((a) => a.innerText),
          text
        );

        state.elements = text.elements;

        paint();
      }
    );

    return dispose;
  }, [options]);

  if (parentText || options.disabled) {
    return children;
  }

  return (
    <span
      ref={ref}
      className={className}
      // @ts-ignore
      href="https://github.com/samdenty/react-ai-flow"
    >
      {options.visualDebug ||
      maskRenderMode === CanvasMaskRenderMode.MozElement ? (
        <canvas
          ref={canvasRef}
          style={
            options.visualDebug
              ? { position: "absolute", pointerEvents: "none" }
              : { display: "none" }
          }
          id={
            maskRenderMode === CanvasMaskRenderMode.MozElement
              ? className
              : undefined
          }
        ></canvas>
      ) : null}

      <StaggeredTextContext.Provider value={id}>
        {children}
      </StaggeredTextContext.Provider>
    </span>
  );
}

export function useTextContext(ref?: React.Ref<Text | null>) {
  const stagger = useStaggerContext();
  const id = useContext(StaggeredTextContext);
  const [text, setText] = useState(
    id == null ? null : () => stagger.getText(id)
  );

  useEffect(() => {
    if (id == null) {
      return;
    }

    return stagger.onDidChangeTexts(() => {
      setText(stagger.getText(id));
    });
  }, [id]);

  useImperativeHandle(ref, () => text, [text]);

  if (id == null) {
    throw new Error("useText must be used within a StaggeredText");
  }

  return text;
}
