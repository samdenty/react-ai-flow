import { createContext, useContext, useEffect, useMemo } from "react";
import { Stagger, type StaggerOptions } from "text-stagger";
import {
  useCachedFunctionLike,
  useCachedOptions,
} from "./utils/useCachedOptions.js";
import { useIsomorphicLayoutEffect } from "./utils/useIsomorphicLayoutEffect.js";
import type {
  GetTargetScrollTop,
  StickToBottomContext,
} from "use-stick-to-bottom";

export interface StaggerProvider extends Stagger {
  stickToBottom: Map<StickToBottomContext, Set<number>>;
}

const StaggerProviderContext = createContext<StaggerProvider | null>(null);

export interface StaggerProviderProps
  extends StaggerOptions,
    Pick<Stagger, "streaming"> {
  children: React.ReactNode;

  targetScrollTop?: GetTargetScrollTop;
}

export function StaggerProvider({
  children,
  streaming = null,
  targetScrollTop: currentTargetScrollTop,
  ...props
}: StaggerProviderProps) {
  const targetScrollTop = useCachedFunctionLike(currentTargetScrollTop);
  const options = useCachedOptions(props);

  const stagger = useMemo(() => {
    const stagger = new Stagger(options) as StaggerProvider;
    stagger.stickToBottom = new Map();
    return stagger;
  }, []);

  useEffect(() => {
    return () => {
      stagger.dispose();
    };
  }, []);

  useEffect(() => {
    return stagger.onDidPaint(() => {
      for (const [stickToBottomContext, texts] of stagger.stickToBottom) {
        const elements = stagger.elements.filter((element) =>
          texts.has(element.text.id)
        );

        const lastElement =
          elements.findLast((element) => element.progress !== 0) ??
          elements.at(-1);

        stickToBottomContext.targetScrollTop = (
          target,
          { scrollElement, contentElement }
        ) => {
          if (!lastElement) {
            return target;
          }

          const scrollRect = scrollElement.getBoundingClientRect();
          const relativePosition =
            lastElement.top +
            lastElement.height +
            lastElement.text.top -
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

        stickToBottomContext.scrollToBottom();
      }
    });
  }, [targetScrollTop]);

  useIsomorphicLayoutEffect(() => {
    stagger.options = options;
  }, [stagger, options]);

  useIsomorphicLayoutEffect(() => {
    stagger.streaming = streaming;
  }, [stagger, streaming]);

  return (
    <StaggerProviderContext.Provider value={stagger}>
      {children}
    </StaggerProviderContext.Provider>
  );
}

export function useStaggerContext() {
  const context = useContext(StaggerProviderContext);

  if (!context) {
    throw new Error("useStagger must be used within a StaggerProvider");
  }

  return context;
}
