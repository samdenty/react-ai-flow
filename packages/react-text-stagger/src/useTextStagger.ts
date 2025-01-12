import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { TextOptions } from "text-stagger";
import { useResolvedOptions } from "./utils/useCachedOptions.js";
import { useStaggerContext } from "./StaggerProvider.js";

let ID = 0;

export function useTextStagger(textOptions: TextOptions = {}) {
  const id = useMemo(() => ID++, []);

  const options = useResolvedOptions(textOptions);
  const stagger = useStaggerContext();
  const elementRef = useRef<HTMLElement | null>();
  const [elementRefCount, updateElementRefCount] = useReducer((x) => x + 1, 0);
  const [text, setText] = useState(() => stagger.getText(id));

  useEffect(() => {
    if (!elementRef.current) {
      return;
    }

    const dispose = stagger.observeText(elementRef.current, id, options);

    setText(stagger.getText(id));

    return dispose;
  }, [elementRefCount, elementRef, options]);

  const ref = useCallback((element: HTMLElement | null | undefined) => {
    elementRef.current = element;
    updateElementRefCount();
  }, []);

  return {
    options,
    text,
    ref,
  };
}
