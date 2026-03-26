import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type ParsedStaggerOptions,
	type StaggerOptions,
	type TextOptions,
	mergeTextSplitter,
} from "text-stagger";
import { useStaggerContext } from "../StaggerProvider.js";

export function useResolvedOptions(options: TextOptions) : TextOptions | null {
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
    if (!staggerOptions) {
      return null;
    }

		const { restartOnSelection, revealOnSelection, ...options } = staggerOptions;

		return mergeTextSplitter(options, cachedOptions);
	}, [staggerOptions, cachedOptions]);

	return mergedOptions;
}

export function useCachedOptions({
	animation: currentAnimation,
	delayTrailing,
	visualDebug,
	maxFps: currentMaxFps,
	restartOnSelection,
	disabled,
	classNamePrefix,
}: StaggerOptions): StaggerOptions {
	const maxFps = useCachedFunctionLike(currentMaxFps);
	const animation = useCachedFunctionLike(currentAnimation);

	return useMemo<StaggerOptions>(
		() => ({
			animation,
			visualDebug,
			maxFps,
			delayTrailing,
			disabled,
			classNamePrefix,
			restartOnSelection,
		}),
		[
			animation,
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
