import { describe, expect, it } from "vitest";
import { optimisticMarkdown } from "../index.js";

describe("optimisticMarkdown", () => {
	describe("code blocks", () => {
		it("should complete code block when content is present", () => {
			const input = "```javascript\nconst x = 1;";
			expect(optimisticMarkdown(input)).toBe(
				"```javascript\nconst x = 1;\n```",
			);
		});

		it("should trim empty code block", () => {
			expect(optimisticMarkdown("```")).toBe("");
			expect(optimisticMarkdown("```\n")).toBe("");
		});

		it("should complete inline code with content", () => {
			expect(optimisticMarkdown("`const x")).toBe("`const x`");
		});

		it("should trim incomplete inline code", () => {
			expect(optimisticMarkdown("` ")).toBe("");
			expect(optimisticMarkdown("`")).toBe("");
		});
	});

	describe("tables", () => {
		it("should process confirmed tables", () => {
			const input = "| Header 1 | Header 2 |\n|----";
			expect(optimisticMarkdown(input)).toBe(
				"| Header 1 | Header 2 |\n|---|---|",
			);
		});

		it("should complete missing table cells", () => {
			const input = "| Header 1 | Header 2 |\n| Data 1 |";
			expect(optimisticMarkdown(input)).toBe(
				"| Header 1 | Header 2 |\n| Data 1 ||",
			);
		});

		it("should trim incomplete table starts", () => {
			expect(optimisticMarkdown("|")).toBe("");
			expect(optimisticMarkdown("| Header")).toBe("");
		});
	});

	describe("lists and horizontal rules", () => {
		it("should trim incomplete list/link markers", () => {
			expect(optimisticMarkdown("- [x")).toBe("");
			expect(optimisticMarkdown("- [")).toBe("");
		});

		it("should preserve complete list items", () => {
			expect(optimisticMarkdown("- item")).toBe("- item");
		});

		it("should handle horizontal rules", () => {
			expect(optimisticMarkdown("--")).toBe("");
			expect(optimisticMarkdown("---")).toBe("---");
			expect(optimisticMarkdown("-")).toBe("");
		});
	});

	describe("links", () => {
		it("should trim incomplete links without markdownLinkTarget", () => {
			expect(optimisticMarkdown("[text](")).toBe("text");
			expect(optimisticMarkdown("[text")).toBe("text");
		});

		it("should complete links with markdownLinkTarget", () => {
			const options = { markdownLinkTarget: "#" };
			expect(optimisticMarkdown("[text", options)).toBe("[text](#)");
			expect(optimisticMarkdown("[text](", options)).toBe("[text](#)");
		});

		it("should preserve complete links", () => {
			const input = "[text](https://example.com)";
			expect(optimisticMarkdown(input)).toBe(input);
		});
	});

	describe("emphasis/bold", () => {
		it("should complete emphasis with content", () => {
			expect(optimisticMarkdown("*text")).toBe("*text*");
		});

		it("should complete bold with content", () => {
			expect(optimisticMarkdown("**text")).toBe("**text**");
		});

		it("should complete bold & italic with content", () => {
			expect(optimisticMarkdown("***text")).toBe("***text***");
		});

		it("should trim incomplete markers without content", () => {
			expect(optimisticMarkdown("*")).toBe("");
			expect(optimisticMarkdown("**")).toBe("");
		});

		it("should handle nested emphasis conservatively", () => {
			expect(optimisticMarkdown("**text*")).toBe("**text**");
			expect(optimisticMarkdown("*text**")).toBe("*text*");
		});
	});

	describe("HTML", () => {
		it("should preserve HTML blocks", () => {
			const html = "<div>*text*</div>";
			expect(optimisticMarkdown(html)).toBe(html);
		});

		it("should handle nested HTML tags", () => {
			const html = "<div><span>text</span></div>";
			expect(optimisticMarkdown(html)).toBe(html);
		});
	});

	describe("footnotes", () => {
		it("should exclude footnotes when loading", () => {
			expect(optimisticMarkdown("[^1]")).toBe("");
		});

		it("should include footnotes when not loading", () => {
			expect(optimisticMarkdown("[^1]", { isLoading: false })).toBe("[^1]");
		});
	});

	describe("line break handling", () => {
		it("should treat formatting tokens split by newlines as text", () => {
			expect(optimisticMarkdown("*foo\nbar*")).toBe("*foo\nbar");
			expect(optimisticMarkdown("**foo\nbar**")).toBe("**foo\nbar");
			expect(optimisticMarkdown("_foo\nbar_")).toBe("_foo\nbar");
			expect(optimisticMarkdown("__foo\nbar__")).toBe("__foo\nbar");
			expect(optimisticMarkdown("`foo\nbar`")).toBe("`foo\nbar");
		});

		it("should treat table cells split by newlines as text", () => {
			expect(optimisticMarkdown("| foo\n| bar |")).toBe("| foo\n| bar |");
		});

		it("should treat link syntax split by newlines as text", () => {
			expect(optimisticMarkdown("[foo\nbar](url)")).toBe("[foo\nbar](url)");
			expect(optimisticMarkdown("[foo](url\nmore)")).toBe("[foo](url\nmore)");
		});

		it("should preserve incomplete tokens when split by newlines", () => {
			expect(optimisticMarkdown("*foo\nbar")).toBe("*foo\nbar");
			expect(optimisticMarkdown("**foo\nbar")).toBe("**foo\nbar");
			expect(optimisticMarkdown("[foo\nbar")).toBe("[foo\nbar");
		});
	});

	describe("complex cases", () => {
		it("should handle nested formatting in incomplete state", () => {
			const input = "**bold *italic** text";
			expect(optimisticMarkdown(input)).toBe("**bold *italic** text");
		});

		it("should handle code blocks with internal formatting", () => {
			const input = "```\n*text*\n**bold**";
			expect(optimisticMarkdown(input)).toBe("```\n*text*\n**bold**\n```");
		});

		it("should handle HTML with internal markdown", () => {
			const input = "<div>*text* and **bold**</div>";
			expect(optimisticMarkdown(input)).toBe(input);
		});
	});

	describe("edge cases", () => {
		it("should handle empty input", () => {
			expect(optimisticMarkdown("")).toBe("");
			expect(optimisticMarkdown(null as any)).toBe("");
			expect(optimisticMarkdown(undefined as any)).toBe("");
		});

		it("should handle whitespace-only input", () => {
			expect(optimisticMarkdown("  \n  ")).toBe("");
		});

		it("should handle escaped characters", () => {
			expect(optimisticMarkdown("\\*text")).toBe("\\*text");
			expect(optimisticMarkdown("\\**text")).toBe("\\**text*");
		});

		it("should handle multiple spaces in formatting", () => {
			expect(optimisticMarkdown("**  text")).toBe("**  text");
			expect(optimisticMarkdown("*  text")).toBe("*  text");
		});
	});
});
