import { RefObject, useEffect, useMemo, useState } from "react";
import { TextOptions } from "text-stagger";
import { useResolvedOptions } from "./utils/useCachedOptions.js";
import { useStaggerContext } from "./StaggerProvider.js";

let ID = 0;

export function useTextStagger(
  ref:
    | RefObject<HTMLElement | null | undefined>
    | null
    | HTMLElement
    | undefined,
  textOptions: TextOptions = {}
) {
  const id = useMemo(() => ID++, []);

  const options = useResolvedOptions(textOptions);
  const stagger = useStaggerContext();

  useEffect(() => {
    const element = ref instanceof HTMLElement ? ref : ref?.current;

    if (!element) {
      stagger.disposeText(id);
      return;
    }

    return stagger.observeText(element, id, options);
  }, [ref, options]);

  const [text, setText] = useState(
    id == null ? null : () => stagger.getText(id)
  );

  useEffect(() => {
    if (id == null) {
      return;
    }

    return stagger.onDidChangeTexts(() => {
      setText(stagger.getText(id));
    });
  }, [id]);

  return { options, text };
}
