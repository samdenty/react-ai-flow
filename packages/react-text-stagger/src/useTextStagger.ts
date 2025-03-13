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

		const dispose = () => {
			for (const [stickToBottomContext, texts] of stagger.stickToBottom) {
				texts.delete(id);

				if (!texts.size) {
					stagger.stickToBottom.delete(stickToBottomContext);
				}
			}
		};

		if (!stickToBottomContext) {
			dispose();
			return;
		}

		let texts = stagger.stickToBottom.get(stickToBottomContext);

		if (!texts) {
			texts = new Set();
			stagger.stickToBottom.set(stickToBottomContext, texts);
		}

		texts.add(id);
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

		const dispose = stagger.observeText(elementRef.current, id, options);

		setText(stagger.getText(id));

		return dispose;
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
