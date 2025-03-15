import { render } from "@testing-library/react";
import {} from "@vitest/browser/context";
import {
	type Stagger,
	StaggerProvider,
	type StaggerProviderProps,
	StaggeredText,
} from "react-text-stagger";
import { record } from "text-stagger-record";
import { expect, it } from "vitest";

async function renderProvider(
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

	if (!stagger) {
		throw new Error("Stagger not found");
	}

	await stagger.ready;

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

it("returns text instance when provider", async () => {
	// const stop = record();

	const { container, stagger } = await renderProvider(
		<StaggeredText>
			Hello World Hello World Hello World Hello World Hello World Hello World
			Hello World Hello World Hello World Hello World Hello World Hello World
			Hello World Hello World Hello World Hello World Hello World Hello World
			Hello World Hello World Hello World Hello World Hello World Hello World
			Hello World Hello World Hello World Hello World Hello World Hello World
			Hello World Hello World Hello World Hello World Hello World Hello World{" "}
		</StaggeredText>,
	);

	await stagger.ready;

	expect(container).toMatchInlineSnapshot(`
		<div>
		  <span
		    class="ai-flow react-text-stagger-1"
		    data-elements="1"
		    data-lines="1"
		  >
		    Hello World
		  </span>
		</div>
	`);

	expect(stagger.elements).toMatchInlineSnapshot(`
		[
		  {
		    "animation": "gradient-reveal",
		    "delay": 0,
		    "duration": 500,
		    "isLast": true,
		    "startTime": 1741921655084,
		    "subtexts": [],
		    "textContent": "Hello World",
		    "uniqueBoxes": [
		      {
		        "gradientWidth": 100,
		        "isLast": true,
		        "progress": 0,
		        "relativeToCanvas": {
		          "bottom": 18.5,
		          "height": 18.5,
		          "left": 0,
		          "right": 78.8671875,
		          "top": 0,
		          "width": 78.8671875,
		        },
		        "subtext": null,
		        "text": {
		          "parentText": undefined,
		        },
		        "timing": 0,
		      },
		    ],
		  },
		]
	`);
});
