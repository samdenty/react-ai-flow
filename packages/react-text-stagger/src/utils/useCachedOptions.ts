import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mergeTextSplitter, TextOptions } from "text-stagger";
import { useStaggerContext } from "../StaggerProvider.js";

export function useResolvedOptions(options: TextOptions) {
  const stagger = useStaggerContext();
  const [staggerOptions, setStaggerOptions] = useState(stagger.options);

  useEffect(() => {
    return stagger.onDidChangeOptions(setStaggerOptions);
  }, [stagger]);

  const cachedOptions = useCachedOptions(options);

  const mergedOptions = useMemo(() => {
    return mergeTextSplitter(staggerOptions, cachedOptions);
  }, [staggerOptions, cachedOptions]);

  return mergedOptions;
}

export function useCachedOptions({
  animation,
  delay,
  duration,
  gradientWidth: currentGradientWidth,
  splitter: currentSplitter,
  visualDebug,
  disabled,
}: TextOptions): TextOptions {
  const splitter = useCachedFunctionLike(currentSplitter);
  const gradientWidth = useCachedFunctionLike(currentGradientWidth);

  return useMemo<TextOptions>(
    () => ({
      animation,
      delay,
      duration,
      splitter,
      gradientWidth,
      visualDebug,
      disabled,
    }),
    [animation, delay, duration, splitter, gradientWidth, visualDebug, disabled]
  );
}

function useCachedFunctionLike<T extends any>(value: T): T {
  const valueRef = useRef(value);
  valueRef.current = value;

  const cachedValue = useCallback(function (this: any, ...args: any[]) {
    const value = valueRef.current;

    if (typeof value === "function") {
      return value.apply(this, args);
    }

    return value;
  }, []);

  if (typeof value === "function") {
    return cachedValue as T;
  }

  return value;
}
