import {
  useEffect,
  useMemo,
  createContext,
  useContext,
  useState,
  useImperativeHandle,
} from "react";
import { useStaggerContext } from "./StaggerProvider.js";
import { Text, type TextOptions } from "text-stagger";
import { useTextStagger } from "./useTextStagger.js";

export interface StaggeredTextProps extends TextOptions {
  children: React.ReactNode;
}

export const StaggeredTextContext = createContext<number | null>(null);

let ID = 0;

export function StaggeredText(props: StaggeredTextProps) {
  const { children, ...restProps } = props;
  const id = useMemo(() => ID++, []);

  let parentText: number | null = null;
  try {
    parentText = useContext(StaggeredTextContext);
  } catch (e) {
    // ignore
  }

  const { ref, options } = useTextStagger(restProps);

  return (
    <StaggeredTextContext.Provider value={id}>
      {parentText || options.disabled ? (
        children
      ) : (
        <div ref={ref}>{children}</div>
      )}
    </StaggeredTextContext.Provider>
  );
}

export function useStaggeredTextContext(ref?: React.Ref<Text | null>) {
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
