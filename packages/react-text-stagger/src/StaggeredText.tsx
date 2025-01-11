import {
  useRef,
  useEffect,
  useMemo,
  createContext,
  useContext,
  useState,
  useImperativeHandle,
} from "react";
import { useStaggerContext } from "./StaggerProvider.js";
import { Text, TextOptions } from "text-stagger";
import { useResolvedOptions } from "./utils/useCachedOptions.js";

export interface StaggeredTextProps extends TextOptions {
  children: React.ReactNode;
}

const StaggeredTextContext = createContext<number | null>(null);

let ID = 0;

export function StaggeredText(props: StaggeredTextProps) {
  const { children, ...restProps } = props;
  const id = useMemo(() => ID++, []);
  const options = useResolvedOptions(restProps);

  let parentText: number | null = null;
  try {
    parentText = useContext(StaggeredTextContext);
  } catch (e) {
    // ignore
  }

  const ref = useRef<HTMLSpanElement>(null);
  const stagger = useStaggerContext();

  useEffect(() => {
    if (!ref.current) {
      stagger.disposeText(id);
      return;
    }

    return stagger.observeText(ref.current, id, options);
  }, [options]);

  return (
    <StaggeredTextContext.Provider value={id}>
      {parentText || options.disabled ? (
        children
      ) : (
        <span ref={ref}>{children}</span>
      )}
    </StaggeredTextContext.Provider>
  );
}

export function useTextContext(ref?: React.Ref<Text | null>) {
  const stagger = useStaggerContext();
  const id = useContext(StaggeredTextContext);
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

  useImperativeHandle(ref, () => text, [text]);

  if (id == null) {
    throw new Error("useText must be used within a StaggeredText");
  }

  return text;
}
