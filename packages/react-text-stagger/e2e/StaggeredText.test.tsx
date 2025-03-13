import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import {
	Stagger,
	StaggerProvider,
	type StaggerProviderProps,
	StaggeredText,
} from "../src/index.js";

function renderProvider(
	children: React.ReactNode,
	props?: StaggerProviderProps,
) {
	let stagger!: Stagger | null;

	const result = render(
		<StaggerProvider
			ref={(staggerRef) => {
				stagger = staggerRef;
			}}
			{...props}
		>
			{children}
		</StaggerProvider>,
	);

	expect(stagger).toBeInstanceOf(Stagger);

	return { stagger, ...result };
}

it("returns empty container when no provider", () => {
	const result = render(<StaggeredText>Hello World</StaggeredText>);

	expect(result.container).toMatchInlineSnapshot(`
    <div>
      <span>
        Hello World
      </span>
    </div>
  `);
});

it("returns text instance when provider", () => {
	const result = renderProvider(<StaggeredText>Hello World</StaggeredText>);

	expect(result.container).toMatchInlineSnapshot(`
    <div>
      <span
        class="ai-flow react-text-stagger-1"
      >
        Hello World
      </span>
    </div>
  `);
});
