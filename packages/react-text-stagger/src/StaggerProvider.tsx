import { createContext, useContext, useMemo } from "react";
import { Stagger, type StaggerOptions } from "text-stagger";
import { useCachedOptions } from "./utils/useCachedOptions.js";
import { useIsomorphicLayoutEffect } from "./utils/useIsomorphicLayoutEffect.js";

const StaggerProviderContext = createContext<Stagger | null>(null);

export interface StaggerProviderProps extends StaggerOptions {
  children: React.ReactNode;

  /**
   * Allows you to hint to whether the stagger is currently streaming a response.
   *
   * If `null`, the streaming state is unknown.
   * If `true` then certain streaming only enhancements are enabled.
   * If `false` the streaming enhancements are disabled.
   *
   * @default null (unknown)
   */
  streaming?: boolean | null;
}

export function StaggerProvider({
  children,
  streaming = null,
  ...props
}: StaggerProviderProps) {
  const options = useCachedOptions(props);

  const stagger = useMemo(() => new Stagger(options), []);

  useIsomorphicLayoutEffect(() => {
    stagger.options = options;

    if (import.meta.env.DEV) {
      globalThis.staggers ??= [];

      if (!globalThis.staggers.includes(stagger)) {
        globalThis.staggers.push(stagger);
      }
    }
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
