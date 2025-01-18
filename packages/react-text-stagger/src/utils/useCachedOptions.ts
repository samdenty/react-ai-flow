import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  mergeTextSplitter,
  type StaggerOptions,
  type TextOptions,
} from "text-stagger";
import { useStaggerContext } from "../StaggerProvider.js";

export function useResolvedOptions(options: TextOptions) {
  const stagger = useStaggerContext();
  const [staggerOptions, setStaggerOptions] = useState(() => stagger.options);

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
  delay: currentDelay,
  duration: currentDuration,
  stagger: currentStagger,
  gradientWidth: currentGradientWidth,
  splitter: currentSplitter,
  delayTrailing,
  visualDebug,
  disabled,
  classNamePrefix,
}: StaggerOptions): StaggerOptions {
  const duration = useCachedFunctionLike(currentDuration);
  const delay = useCachedFunctionLike(currentDelay);
  const stagger = useCachedFunctionLike(currentStagger);
  const splitter = useCachedFunctionLike(currentSplitter);
  const gradientWidth = useCachedFunctionLike(currentGradientWidth);

  return useMemo<StaggerOptions>(
    () => ({
      animation,
      delay,
      duration,
      splitter,
      stagger,
      gradientWidth,
      visualDebug,
      delayTrailing,
      disabled,
      classNamePrefix,
    }),
    [
      animation,
      delay,
      duration,
      splitter,
      stagger,
      gradientWidth,
      visualDebug,
      delayTrailing,
      disabled,
      classNamePrefix,
    ]
  );
}

export function useCachedFunctionLike<T extends any>(value: T): T {
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
