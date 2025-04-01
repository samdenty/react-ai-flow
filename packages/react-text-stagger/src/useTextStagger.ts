import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TextOptions } from "text-stagger";
import {
	type StickToBottomContext,
	useStickToBottomContext,
} from "use-stick-to-bottom";
import { useStaggerContext } from "./StaggerProvider.js";
import { useResolvedOptions } from "./utils/useCachedOptions.js";

let ID = 0;

export function useTextStagger(textOptions: TextOptions = {}) {
	const id = useMemo(() => ID++, []);

	let stickToBottomContext: StickToBottomContext | null = null;

	try {
		stickToBottomContext = useStickToBottomContext();
	} catch {
		// ignore
	}

	const stagger = useStaggerContext();
	const options = useResolvedOptions(
		stagger ? textOptions : { ...textOptions, disabled: true },
	);
	const elementRef = useRef<HTMLElement | null>();
	const [initialized, setInitialized] = useState(false);
	const [text, setText] = useState(() => stagger?.getText(id));

	useEffect(() => {
		if (!stagger) {
			return;
		}

		if (!stickToBottomContext) {
			return;
		}

		let texts = stagger.stickToBottom.get(stickToBottomContext);

		if (!texts) {
			texts = new Set();
			stagger.stickToBottom.set(stickToBottomContext, texts);
		}

		texts.add(id);

		return () => {
			texts.delete(id);

			if (!texts.size) {
				stagger.stickToBottom.delete(stickToBottomContext);
			}
		};
	}, [id, stagger, stickToBottomContext]);

	useEffect(() => {
		if (
			!stagger ||
			!elementRef.current ||
			!initialized ||
			!options ||
			options.disabled
		) {
			return;
		}

		const text = stagger.observeText(elementRef.current, {
			...options,
			id,
		});

		setText(text);

		return () => text.dispose();
	}, [initialized, options, id, stagger]);

	const ref = useCallback(
		(element: HTMLElement | null | undefined) => {
			const existingText = stagger?.getText(id);

			if (existingText) {
				existingText.container = element || undefined;
			} else if (element && !elementRef.current) {
				setInitialized(true);
			}

			elementRef.current = element;
		},
		[id, stagger],
	);

	return {
		id,
		options,
		text,
		ref,
	};
}
