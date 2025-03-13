import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Stagger, Text } from "../../index.js";

function scanText(children: React.ReactNode) {
	const stagger = new Stagger();
	const { container } = render(children);
	return Text.scanText(stagger, 0, container, {});
}

describe("Text", () => {
	it("works", () => {
		const { lines } = scanText(<div>hello world</div>);

		expect(lines.map((line) => line.innerText)).toEqual(["hello world"]);
	});

	it.skip("works with new lines", () => {
		const { lines } = scanText(<div>{"hello \nworld"}</div>);

		expect(lines.map((line) => line.innerText)).toEqual(["hello \n", "world"]);
	});

	it("works with <br />", () => {
		const { lines } = scanText(
			<div>
				hello <br /> world
			</div>,
		);

		expect(lines.map((line) => line.innerText)).toEqual(["hello \n", " world"]);
	});

	it("works with block elements", () => {
		const { lines } = scanText(
			<div>
				hello world<h1>foo bar</h1>
			</div>,
		);

		expect(lines.map((line) => line.innerText)).toEqual([
			"hello world\r\n",
			"foo bar",
		]);
	});

	it("works with default text wrapping", () => {
		const { lines } = scanText(
			<div style={{ width: "160px" }}>
				the quick brown fox jumps over the lazy dog
			</div>,
		);

		expect(lines.map((line) => line.innerText)).toEqual([
			"the quick brown fox \n",
			"jumps over the lazy dog",
		]);
	});

	it("works with break-word", () => {
		const { lines } = scanText(
			<div
				style={{
					width: "180px",
					overflowWrap: "break-word",
					overflow: "hidden",
				}}
			>
				thequickbrownfox123456789 jumps over the lazy dog
			</div>,
		);

		expect(lines.map((line) => line.innerText)).toEqual([
			"thequickbrownfox1234567\n",
			"89 jumps over the lazy dog",
		]);
	});

	it("works with multiple text nodes", () => {
		const { lines } = scanText(
			<div
				style={{
					width: "150px",
					overflowWrap: "break-word",
					overflow: "hidden",
				}}
			>
				{"foo bar foo bar foo bar"}
				{"foo"}
				{"bar"}
				{"foo"}
				{"foo bar foo"}
			</div>,
		);

		expect(lines.map((line) => line.innerText)).toEqual([
			"foo bar foo bar foo \n",
			"barfoobarfoofoo bar \n",
			"foo",
		]);
	});
});
