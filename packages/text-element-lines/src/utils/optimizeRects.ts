export function preserveOptimizeRects<T = DOMRect, K extends any[] = [number]>(
	rects: DOMRect[],
	create?: (rect: DOMRect, indexes: number[], ...key: K) => T,
	getKey?: (rect: DOMRect, index: number) => K[0] | K | null,
): T[];
export function preserveOptimizeRects<T = DOMRect, K extends any[] = [number]>(
	rects: DOMRect[][],
	create?: (
		rect: DOMRect,
		indexes: [index1: number, index2: number][],
		...key: K
	) => T,
	getKey?: (rect: DOMRect, index1: number, index2: number) => K[0] | K | null,
): T[][];
export function preserveOptimizeRects(
	rects: DOMRect[] | DOMRect[][],
	create?: (rect: DOMRect, ...args: any[]) => any,
	getKey?: (rect: DOMRect, ...args: any[]) => any,
): any[] {
	const rectsArray = (Array.isArray(rects[0]) ? rects : [rects]) as DOMRect[][];
	const isFlat = !Array.isArray(rects[0]);

	const TOLERANCE = 1;

	const inputRectsIndexes = new Map(
		rectsArray.flatMap((rectGroup, groupIndex) => {
			return rectGroup.map((rect, rectIndex) => {
				return [
					rect,
					isFlat ? ([rectIndex] as const) : ([groupIndex, rectIndex] as const),
				] as const;
			});
		}),
	);

	const keyArrays = new Map<Map<any, any>, any[]>();
	const cachedKey = new Map<any, any>();
	const keys = new Map<DOMRect, any>();

	if (getKey) {
		for (const rect of rectsArray.flat()) {
			const indexes = inputRectsIndexes.get(rect)!;
			let rawKeysArray = getKey(rect, ...indexes);
			if (rawKeysArray == null) {
				continue;
			}

			if (!Array.isArray(rawKeysArray)) {
				rawKeysArray = [rawKeysArray];
			}

			if (rawKeysArray.length === 0) {
				continue;
			}

			let keyReference = cachedKey;

			for (const key of rawKeysArray) {
				if (!keyReference.has(key)) {
					keyReference.set(key, new Map());
				}

				keyReference = keyReference.get(key);
			}

			let keysArrayRef = keyArrays.get(keyReference);
			if (!keysArrayRef) {
				keysArrayRef = [...rawKeysArray];
				keyArrays.set(keyReference, keysArrayRef);
			}

			keys.set(rect, keysArrayRef);
		}
	}

	const optimizedRects = new Map<DOMRect, Set<DOMRect>>();

	for (const inputRect of inputRectsIndexes.keys()) {
		const inputRectKey = keys.get(inputRect);

		// Try to find existing rectangle to merge with
		const mergeWith = [...optimizedRects.entries()].find(
			([existingRect, [existingInputRect]]) => {
				const existingInputRectKey = keys.get(existingInputRect!);

				if (inputRectKey) {
					return inputRectKey === existingInputRectKey;
				}

				const sameHeight =
					Math.abs(existingRect.height - inputRect.height) <= TOLERANCE;
				const sameTop = Math.abs(existingRect.top - inputRect.top) <= TOLERANCE;
				const isAdjacent =
					Math.abs(existingRect.left - inputRect.right) <= TOLERANCE ||
					Math.abs(existingRect.right - inputRect.left) <= TOLERANCE;
				const isOverlapping =
					existingRect.left <= inputRect.right + TOLERANCE &&
					inputRect.left <= existingRect.right + TOLERANCE;
				const rect1ContainsRect2 =
					existingRect.left <= inputRect.left + TOLERANCE &&
					existingRect.right >= inputRect.right - TOLERANCE &&
					existingRect.top <= inputRect.top + TOLERANCE &&
					existingRect.bottom >= inputRect.bottom - TOLERANCE;
				const rect2ContainsRect1 =
					inputRect.left <= existingRect.left + TOLERANCE &&
					inputRect.right >= existingRect.right - TOLERANCE &&
					inputRect.top <= existingRect.top + TOLERANCE &&
					inputRect.bottom >= existingRect.bottom - TOLERANCE;

				return (
					(sameHeight && sameTop && (isAdjacent || isOverlapping)) ||
					rect1ContainsRect2 ||
					rect2ContainsRect1
				);
			},
		);

		if (!mergeWith) {
			optimizedRects.set(inputRect, new Set([inputRect]));
			continue;
		}

		// Create merged rectangle and replace existing one
		const [mergeWithRect, mergedRects] = mergeWith;
		mergedRects.add(inputRect);

		const top = Math.min(mergeWithRect.top, inputRect.top);
		const left = Math.min(mergeWithRect.left, inputRect.left);
		const bottom = Math.max(mergeWithRect.bottom, inputRect.bottom);
		const right = Math.max(mergeWithRect.right, inputRect.right);

		const newMergedRect = new DOMRect(left, top, right - left, bottom - top);

		optimizedRects.delete(mergeWithRect);
		optimizedRects.set(newMergedRect, mergedRects);
	}

	// Transform the optimized rects if a creator function is provided
	const transformed = new Map(
		[...optimizedRects.entries()].flatMap(([optimized, [...inputRects]]) => {
			let transformed = optimized;
			if (create) {
				const key = keys.get(inputRects[0]!) ?? [];
				const indexes = inputRects.map((inputRect) => {
					const index = inputRectsIndexes.get(inputRect)!;

					return isFlat ? index[0] : index;
				});

				transformed = create(optimized, indexes, ...key);
			}

			return inputRects.map((inputRect) => {
				return [inputRect, transformed] as const;
			});
		}),
	);

	// Reconstruct the original array structure with optimized/transformed rects
	const result = rectsArray.map((rectGroup) =>
		rectGroup.map((rect) => transformed.get(rect)!),
	);

	return isFlat ? (result[0] ?? []) : result;
}

export function optimizeRects<T = DOMRect, K extends any[] = [number]>(
	rects: DOMRect[],
	create?: (rect: DOMRect, indexes: number[], ...key: K) => T,
	getKey?: (rect: DOMRect, index: number) => K[0] | K | null,
): T[];
export function optimizeRects<T = DOMRect, K extends any[] = [number]>(
	rects: DOMRect[][],
	create?: (
		rect: DOMRect,
		indexes: [index1: number, index2: number][],
		...key: K
	) => T,
	getKey?: (rect: DOMRect, index1: number, index2: number) => K[0] | K | null,
): T[];
export function optimizeRects(
	rects: DOMRect[] | DOMRect[][],
	create?: (rect: DOMRect, ...args: any[]) => any,
	getKey?: (rect: DOMRect, ...args: any[]) => any,
): any[] {
	const optimized = preserveOptimizeRects(rects as any, create, getKey);

	return [
		...new Set(
			Array.isArray(optimized[0])
				? (optimized as any[][]).flat()
				: (optimized as any[]),
		),
	];
}
