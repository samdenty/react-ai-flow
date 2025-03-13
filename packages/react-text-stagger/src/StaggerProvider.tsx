import {
	createContext,
	forwardRef,
	useContext,
	useEffect,
	useImperativeHandle,
	useState,
} from "react";
import { Stagger, type StaggerOptions } from "text-stagger";
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
			const stagger = new Stagger({ ...options, streaming }) as StaggerProvider;
			stagger.stickToBottom = new Map();
			setStagger(stagger);
			return () => stagger.dispose();
		}, []);

		useImperativeHandle(ref, () => stagger!, [stagger]);

		useEffect(() => {
			if (!stagger) {
				return;
			}

			return stagger.onDidPaint(() => {
				for (const [stickToBottomContext, texts] of stagger.stickToBottom) {
					const elements = stagger.elements.filter((element) =>
						texts.has(element.text.id),
					);

					const lastElement =
						elements.findLast((element) => element.progress !== 0) ??
						elements.at(-1);

					stickToBottomContext.targetScrollTop = (
						target,
						{ scrollElement, contentElement },
					) => {
						if (!lastElement) {
							return target;
						}

						const scrollRect = scrollElement.getBoundingClientRect();
						const relativePosition = lastElement.bottom - scrollRect.top;

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

					stickToBottomContext.scrollToBottom();
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
