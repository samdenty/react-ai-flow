import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type ParsedStaggerOptions,
	type StaggerOptions,
	type TextOptions,
	mergeTextSplitter,
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
	vibration: currentVibration,
	gradientWidth: currentGradientWidth,
	customStyles: currentCustomStyles,
	blurAmount: currentBlurAmount,
	animationTiming: currentAnimationTiming,
	splitter: currentSplitter,
	delayTrailing,
	visualDebug,
	maxFps: currentMaxFps,
	restartOnSelection,
	disabled,
	classNamePrefix,
}: StaggerOptions): StaggerOptions {
	const maxFps = useCachedFunctionLike(currentMaxFps);
	const duration = useCachedFunctionLike(currentDuration);
	const vibration = useCachedFunctionLike(currentVibration);
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
			vibration,
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
			restartOnSelection,
		}),
		[
			animation,
			delay,
			duration,
			vibration,
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
			restartOnSelection,
		],
	);
}

export function useCachedFunctionLike<T>(value: T): T {
	const valueRef = useRef(value);
	valueRef.current = value;

	const cachedValue = useCallback(function (this: any, ...args: any[]) {
		const value = valueRef.current;

		if (typeof value === "function") {
			return value.apply(this, args);
		}

		return value;
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: not needed
	const cachedArrayLike = useMemo(
		() => (Array.isArray(value) ? value : null),
		Array.isArray(value) ? value : [],
	);

	if (cachedArrayLike !== null) {
		return cachedArrayLike as T;
	}

	if (typeof value === "function") {
		return cachedValue as T;
	}

	return value;
}
