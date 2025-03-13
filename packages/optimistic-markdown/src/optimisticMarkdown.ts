interface OptimisticMarkdownOptions {
	isLoading?: boolean;
	markdownLinkTarget?: string;
}

export function optimisticMarkdown(
	markdown: string,
	options: OptimisticMarkdownOptions = {},
): string {
	const { isLoading = true, markdownLinkTarget } = options;

	if (!markdown) {
		return "";
	}

	let output = "";
	let pos = 0;
	let inHtmlBlock = false;
	const htmlTagStack: string[] = [];
	let tableColumns = 0;
	let tagsToClose: ("*" | "_" | "`")[] = [];
	let insertAutoClose = false;
	let inCodeBlock = false;
	let inFencedCodeBlock = false;

	while (pos < markdown.length) {
		const char = markdown[pos]!;

		// Handle HTML blocks
		if (char === "<" && isLetter(markdown[pos + 1]!)) {
			const tagMatch = markdown
				.slice(pos)
				.match(/^<(\/?[a-zA-Z][a-zA-Z0-9]*)[\s>]/);
			if (tagMatch) {
				inHtmlBlock = true;
				if (tagMatch[1]!.startsWith("/")) {
					htmlTagStack.pop();
					if (htmlTagStack.length === 0) {
						inHtmlBlock = false;
					}
				} else {
					htmlTagStack.push(tagMatch[1]!);
				}
				output += markdown[pos];
				pos++;
				continue;
			}
		}

		// Skip processing if in HTML block
		if (inHtmlBlock) {
			output += markdown[pos];
			pos++;
			continue;
		}

		// Handle escaped characters
		if (char === "\\") {
			output += markdown[pos]! + markdown[pos + 1]!;
			pos += 2;
			continue;
		}

		// Handle tables
		if (char === "|" && (pos === 0 || markdown[pos - 1] === "\n")) {
			const lineEnd = markdown.indexOf("\n", pos);
			const line =
				lineEnd === -1 ? markdown.slice(pos) : markdown.slice(pos, lineEnd);
			const cells = line.split("|").filter(Boolean);
			const columns = cells.length;

			if (columns > 1) {
				// If this is our first table row, establish column count
				if (tableColumns === 0) {
					tableColumns = columns;
					output += `${line}\n`;
				} else {
					// Check if this is a separator line
					const isSeparator = cells.every((cell) =>
						cell.trim().startsWith("-"),
					);
					if (isSeparator) {
						output += `|${Array(tableColumns).fill("---").join("|")}|\n`;
					} else {
						output += line;
						if (columns < tableColumns) {
							output += "|".repeat(tableColumns - columns + 1);
						}
						output += "\n";
					}
				}
				pos = lineEnd === -1 ? markdown.length : lineEnd + 1;
				continue;
			}
			// Not a confirmed table row
			pos = lineEnd === -1 ? markdown.length : lineEnd + 1;
			continue;
		}

		// Handle lists and horizontal rules
		if (char === "-") {
			const line = markdown.slice(pos);
			const isHr = /^-{3,}$/.test(line.trim());
			const isList = line.startsWith("- ");

			if (isHr && line.trim().length >= 3) {
				output += "---";
				pos += line.length;
				continue;
			}

			if (isList) {
				const afterHypen = line.slice(1);
				const trimmedAfterHypen = afterHypen.trimStart();

				// Check for incomplete checkbox or link
				if (
					trimmedAfterHypen === "[" ||
					trimmedAfterHypen === "[x" ||
					trimmedAfterHypen === "[ "
				) {
					pos += line.length;
					continue;
				}

				if (trimmedAfterHypen.trimEnd()) {
					output += markdown[pos];
					pos++;
					continue;
				}
			}

			const textBeforePos = markdown.slice(0, pos);
			const lastNewLine = textBeforePos.lastIndexOf("\n");
			const lastLine = textBeforePos.slice(lastNewLine + 1);

			if (!lastLine.split("-").join("").trim()) {
				pos++;
				continue;
			}
		}

		// Handle links
		if (char === "[") {
			const nextNewline = markdown.indexOf("\n", pos);
			const textEnd = markdown.indexOf("]", pos);

			// If we hit a newline before closing bracket, or no closing bracket found
			if (textEnd === -1 || (nextNewline !== -1 && nextNewline < textEnd)) {
				if (nextNewline !== -1) {
					output += markdown.slice(pos, nextNewline);
					pos = nextNewline;
				} else {
					if (markdownLinkTarget) {
						const text = markdown.slice(pos + 1);
						output += `[${text}](${markdownLinkTarget})`;
					} else {
						output += markdown.slice(pos + 1);
					}
					pos = markdown.length;
				}
				continue;
			}

			const linkStart = textEnd + 1;
			if (markdown[linkStart] === "(") {
				const linkNewline = markdown.indexOf("\n", linkStart);
				const linkEnd = markdown.indexOf(")", linkStart);

				// If we hit a newline before closing paren, or no closing paren found
				if (linkEnd === -1 || (linkNewline !== -1 && linkNewline < linkEnd)) {
					const text = markdown.slice(pos + 1, textEnd);
					if (markdownLinkTarget) {
						output += `[${text}](${markdownLinkTarget})`;
					} else {
						output += text;
					}

					pos = linkNewline !== -1 ? linkNewline : markdown.length;
					continue;
				}
			}

			output += markdown.slice(pos, linkStart);
			pos = linkStart;
			continue;
		}

		if (char === "\n") {
			if (inFencedCodeBlock) {
				insertAutoClose = true;
			} else {
				tagsToClose = [];
				inFencedCodeBlock = false;
				inCodeBlock = false;
			}
		}

		if ((!inCodeBlock && (char === "*" || char === "_")) || char === "`") {
			if (!insertAutoClose) {
				const hasNonCodeTick = markdown
					.slice(pos + 1)
					.trim()
					.split("")
					.some((nextChar) => nextChar !== char);

				if (hasNonCodeTick) {
					tagsToClose.unshift(char);
				} else {
					pos++;
					continue;
				}
			} else if (tagsToClose[0] === char) {
				tagsToClose.shift();
				insertAutoClose = !!tagsToClose.length;
			}

			inCodeBlock = tagsToClose.includes("`");
			inFencedCodeBlock = tagsToClose.slice(0, 3).join("") === "```";
		}

		if (
			char === " " &&
			(tagsToClose[0] === "*" || tagsToClose[0] === "_") &&
			tagsToClose[0] === markdown[pos - 1]
		) {
			tagsToClose = tagsToClose.filter((tag) => tag === "`");
		}

		if ((!inFencedCodeBlock && isLetter(char)) || pos === markdown.length - 1) {
			insertAutoClose = tagsToClose.length > 0;
		}

		// Handle footnotes
		if (markdown[pos] === "[" && markdown[pos + 1] === "^") {
			const footnoteEnd = markdown.indexOf("]", pos);
			if (footnoteEnd !== -1) {
				if (!isLoading) {
					output += markdown.slice(pos, footnoteEnd + 1);
				}
				pos = footnoteEnd + 1;
				continue;
			}
		}

		output += markdown[pos];
		pos++;
	}

	const autoClosedTags = tagsToClose.join("");

	if (insertAutoClose && autoClosedTags) {
		if (inFencedCodeBlock && !output.endsWith("\n")) {
			output += "\n";
		}

		output += autoClosedTags;
	}

	return output.trim();
}

function isLetter(char: string): boolean {
	return /[a-zA-Z]/.test(char);
}
