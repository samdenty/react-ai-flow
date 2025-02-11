import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  mergeTextSplitter,
  type ParsedStaggerOptions,
  type StaggerOptions,
  type TextOptions,
} from "text-stagger";
import { useStaggerContext } from "../StaggerProvider.js";

export function useResolvedOptions(options: TextOptions) {
  const stagger = useStaggerContext();
  const [staggerOptions, setStaggerOptions] =
    useState<ParsedStaggerOptions | null>(null);

  useEffect(() => {
    if (!stagger) {
      return;
    }

    setStaggerOptions(stagger.options);

    return stagger.onDidChangeOptions(setStaggerOptions);
  }, [stagger]);

  const cachedOptions = useCachedOptions(options);

  const mergedOptions = useMemo(() => {
    return staggerOptions && mergeTextSplitter(staggerOptions, cachedOptions);
  }, [staggerOptions, cachedOptions]);

  return mergedOptions;
}

export function useCachedOptions({
  animation,
  delay: currentDelay,
  duration: currentDuration,
  stagger: currentStagger,
  gradientWidth: currentGradientWidth,
  customStyles: currentCustomStyles,
  blurAmount: currentBlurAmount,
  animationTiming: currentAnimationTiming,
  splitter: currentSplitter,
  delayTrailing,
  visualDebug,
  maxFps: currentMaxFps,
  disabled,
  classNamePrefix,
}: StaggerOptions): StaggerOptions {
  const maxFps = useCachedFunctionLike(currentMaxFps);
  const duration = useCachedFunctionLike(currentDuration);
  const delay = useCachedFunctionLike(currentDelay);
  const stagger = useCachedFunctionLike(currentStagger);
  const splitter = useCachedFunctionLike(currentSplitter);
  const gradientWidth = useCachedFunctionLike(currentGradientWidth);
  const customStyles = useCachedFunctionLike(currentCustomStyles);
  const blurAmount = useCachedFunctionLike(currentBlurAmount);
  const animationTiming = useCachedFunctionLike(currentAnimationTiming);

  return useMemo<StaggerOptions>(
    () => ({
      animation,
      delay,
      duration,
      splitter,
      stagger,
      gradientWidth,
      customStyles,
      blurAmount,
      animationTiming,
      visualDebug,
      maxFps,
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
      customStyles,
      blurAmount,
      animationTiming,
      visualDebug,
      maxFps,
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
