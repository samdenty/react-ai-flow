import { createContext, useContext, useMemo } from "react";
import { Stagger, TextOptions } from "text-stagger";
import { useCachedOptions } from "./utils/useCachedOptions.js";
import { useIsomorphicLayoutEffect } from "./utils/useIsomorphicLayoutEffect.js";

const StaggerProviderContext = createContext<Stagger | null>(null);

export interface StaggerProviderProps extends TextOptions {
  children: React.ReactNode;
}

export function StaggerProvider({ children, ...props }: StaggerProviderProps) {
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
