import {
	createContext,
	forwardRef,
	useContext,
	useEffect,
	useImperativeHandle,
	useState,
} from "react";
import type { Text, TextOptions } from "text-stagger";
import { useStaggerContext } from "./StaggerProvider.js";
import { useTextStagger } from "./useTextStagger.js";

export interface StaggeredTextProps extends TextOptions {
	children: React.ReactNode;
}

export const StaggeredTextContext = createContext<number | null>(null);

export const StaggeredText = forwardRef<Text | null, StaggeredTextProps>(
	(props, textRef) => {
		const { children, ...restProps } = props;
		const { text, id, ref, options } = useTextStagger(restProps);

		useImperativeHandle(textRef, () => text ?? null!, [text]);

		return (
			<StaggeredTextContext.Provider value={id}>
				{options?.disabled ? children : <span ref={ref}>{children}</span>}
			</StaggeredTextContext.Provider>
		);
	},
);

export function useStaggeredTextContext(ref?: React.Ref<Text | null>) {
	const stagger = useStaggerContext();
	const id = useContext(StaggeredTextContext);
	const [text, setText] = useState<Text | null>(null);

	useEffect(() => {
		if (!stagger || id == null) {
			return;
		}

		setText(stagger.getText(id));

		return stagger.onDidChangeTexts(() => {
			setText(stagger.getText(id));
		});
	}, [stagger, id]);

	useImperativeHandle(ref, () => text, [text]);

	if (id == null) {
		throw new Error("useText must be used within a StaggeredText");
	}

	return text;
}
