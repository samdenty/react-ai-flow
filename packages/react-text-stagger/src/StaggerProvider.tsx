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

  const animation = useMemo(() => new Stagger(options), []);

  useIsomorphicLayoutEffect(() => {
    animation.options = options;
  }, [animation, options]);

  return (
    <StaggerProviderContext.Provider value={animation}>
      {children}
    </StaggerProviderContext.Provider>
  );
}

export function useStagger() {
  const context = useContext(StaggerProviderContext);

  if (!context) {
    throw new Error("useStagger must be used within a StaggerProvider");
  }

  return context;
}
