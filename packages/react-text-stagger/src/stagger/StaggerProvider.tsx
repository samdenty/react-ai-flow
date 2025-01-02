import { createContext, useContext, useMemo } from "react";
import { Stagger } from "./Stagger.js";
import { useIsomorphicLayoutEffect } from "../utils/useIsomorphicLayoutEffect.js";

const StaggerProviderContext = createContext<Stagger | null>(null);

export interface StaggerProviderProps {
  children: React.ReactNode;
  streaming: boolean | null;
}

export function StaggerProvider({
  streaming = null,
  children,
}: StaggerProviderProps) {
  const animation = useMemo(() => new Stagger(streaming), []);

  useIsomorphicLayoutEffect(() => {
    animation.streaming = streaming;
  }, [streaming]);

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
