import {
	createContext,
	forwardRef,
	useContext,
	useEffect,
	useImperativeHandle,
	useState,
} from "react";
import {
	Stagger,
	type StaggerElement,
	type StaggerOptions,
} from "text-stagger";
import type {
	GetTargetScrollTop,
	StickToBottomContext,
} from "use-stick-to-bottom";
import {
	useCachedFunctionLike,
	useCachedOptions,
} from "./utils/useCachedOptions.js";
import { useIsomorphicLayoutEffect } from "./utils/useIsomorphicLayoutEffect.js";

export interface StaggerProvider extends Stagger {
	stickToBottom: Map<StickToBottomContext, Set<number>>;
}

const StaggerProviderContext = createContext<StaggerProvider | null>(null);

export interface StaggerProviderProps extends StaggerOptions {
	children?: React.ReactNode;

	targetScrollTop?: GetTargetScrollTop;
}

export const StaggerProvider = forwardRef<Stagger, StaggerProviderProps>(
	(
		{
			children,
			streaming = null,
			targetScrollTop: currentTargetScrollTop,
			...props
		}: StaggerProviderProps,
		ref,
	) => {
		const targetScrollTop = useCachedFunctionLike(currentTargetScrollTop);
		const options = useCachedOptions(props);

		const [stagger, setStagger] = useState<StaggerProvider | null>(null);

		// biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
		useEffect(() => {
			const stagger = new Stagger({
				...options,
				streaming,
			}) as StaggerProvider;

			stagger.stickToBottom = new Map();

			setStagger(stagger);

			return () => stagger.dispose();
		}, []);

		useImperativeHandle(ref, () => stagger!, [stagger]);

		useEffect(() => {
			if (!stagger) {
				return;
			}

			let lastActiveElement: StaggerElement;

			return stagger.onDidPaint(() => {
				for (const [stickToBottomContext, texts] of stagger.stickToBottom) {
					const elements = stagger.elements.filter((element) =>
						texts.has(element.text.id),
					);

					const activeElements = elements.filter((element) => element.active);
					const activeElement = activeElements.at(-1) ?? lastActiveElement;

					lastActiveElement = activeElement;

					stickToBottomContext.targetScrollTop = (
						target,
						{ scrollElement, contentElement },
					) => {
						if (!activeElement) {
							return target;
						}

						const scrollRect = scrollElement.getBoundingClientRect();
						const relativePosition =
							activeElement.top +
							activeElement.height * activeElement.progress -
							scrollRect.top;

						const newTarget =
							scrollElement.scrollTop +
							(relativePosition - scrollElement.clientHeight);

						if (targetScrollTop) {
							return targetScrollTop(newTarget, {
								scrollElement,
								contentElement,
							});
						}

						return newTarget + 32;
					};
				}
			});
		}, [stagger, targetScrollTop]);

		useIsomorphicLayoutEffect(() => {
			if (stagger) {
				stagger.options = options;
			}
		}, [stagger, options]);

		useIsomorphicLayoutEffect(() => {
			if (stagger) {
				stagger.streaming = streaming;
			}
		}, [stagger, streaming]);

		return (
			<StaggerProviderContext.Provider value={stagger}>
				{children}
			</StaggerProviderContext.Provider>
		);
	},
);

export function useStaggerContext() {
	return useContext(StaggerProviderContext);
}
