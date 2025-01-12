interface OptimisticMarkdownOptions {
  isLoading?: boolean;
  markdownLinkTarget?: string;
}

export function optimisticMarkdown(
  markdown: string,
  options: OptimisticMarkdownOptions = {}
): string {
  const { isLoading = true, markdownLinkTarget } = options;

  if (!markdown) {
    return "";
  }

  let output = "";
  let pos = 0;
  let inHtmlBlock = false;
  let htmlTagStack: string[] = [];
  let inCodeBlock = false;
  let tableColumns = 0;

  while (pos < markdown.length) {
    // Handle HTML blocks
    if (markdown[pos] === "<" && isLetter(markdown[pos + 1])) {
      const tagMatch = markdown
        .slice(pos)
        .match(/^<(\/?[a-zA-Z][a-zA-Z0-9]*)[\s>]/);
      if (tagMatch) {
        inHtmlBlock = true;
        if (tagMatch[1].startsWith("/")) {
          htmlTagStack.pop();
          if (htmlTagStack.length === 0) {
            inHtmlBlock = false;
          }
        } else {
          htmlTagStack.push(tagMatch[1]);
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
    if (markdown[pos] === "\\") {
      output += markdown[pos] + markdown[pos + 1];
      pos += 2;
      continue;
    }

    // Handle code blocks
    if (markdown.slice(pos).startsWith("```")) {
      const nextNewline = markdown.indexOf("\n", pos + 3);
      if (
        nextNewline === -1 ||
        markdown.slice(pos + 3, nextNewline).trim() === ""
      ) {
        pos = markdown.length;
        continue;
      }

      inCodeBlock = !inCodeBlock;
      if (inCodeBlock) {
        const content = markdown.slice(pos, nextNewline);
        output += content + "\n";
        pos = nextNewline + 1;
      } else {
        output += markdown.slice(pos, nextNewline) + "\n```";
        pos = nextNewline + 1;
      }
      continue;
    } else if (markdown[pos] === "`" && !inCodeBlock) {
      const nextChar = markdown[pos + 1];
      if (!nextChar || nextChar === "`" || nextChar === " ") {
        pos++;
        continue;
      }
      const content = markdown.slice(pos + 1);
      if (content.trim()) {
        output += "`" + content + "`";
        pos = markdown.length;
      }
      continue;
    }

    // Skip processing if in code block
    if (inCodeBlock) {
      const nextTripleBacktick = markdown.indexOf("```", pos);
      if (nextTripleBacktick === -1) {
        output += markdown.slice(pos) + "\n```";
        pos = markdown.length;
      } else {
        output += markdown.slice(pos, nextTripleBacktick);
        pos = nextTripleBacktick;
      }
      continue;
    }

    // Handle tables
    if (markdown[pos] === "|" && (pos === 0 || markdown[pos - 1] === "\n")) {
      const lineEnd = markdown.indexOf("\n", pos);
      const line =
        lineEnd === -1 ? markdown.slice(pos) : markdown.slice(pos, lineEnd);
      const cells = line.split("|").filter(Boolean);
      const columns = cells.length;

      if (columns > 1) {
        // If this is our first table row, establish column count
        if (tableColumns === 0) {
          tableColumns = columns;
          output += line + "\n";
        } else {
          // Check if this is a separator line
          const isSeparator = cells.every((cell) =>
            cell.trim().startsWith("-")
          );
          if (isSeparator) {
            output += "|" + Array(tableColumns).fill("---|").join("") + "|\n";
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
    if (markdown[pos] === "-") {
      const line = markdown.slice(pos);
      const isHr = /^-{3,}$/.test(line.trim());
      const isList = line.startsWith("- ");

      if (isHr && line.trim().length >= 3) {
        output += "---";
        pos += line.length;
        continue;
      }

      if (isList) {
        const afterHyphen = line.slice(2);
        // Check for incomplete checkbox or link
        if (afterHyphen.startsWith("[")) {
          // Could be [x], [x] , [x]text, [xyz], [xyz](url), etc.
          const nextCloseBracket = afterHyphen.indexOf("]");
          const isCheckbox = /^\[[x ]\]/.test(afterHyphen);

          // If we can't confirm it's a checkbox, trim it
          if (nextCloseBracket === -1 || !isCheckbox) {
            pos += 2; // Skip the "- "
            continue;
          }
        }
        const lineEnd = markdown.indexOf("\n", pos);
        if (lineEnd === -1) {
          output += markdown.slice(pos);
          pos = markdown.length;
        } else {
          output += markdown.slice(pos, lineEnd + 1);
          pos = lineEnd + 1;
        }
        continue;
      }

      pos++;
      continue;
    }

    // Handle links
    if (markdown[pos] === "[") {
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
          output += markdown.slice(
            pos,
            linkNewline !== -1 ? linkNewline : markdown.length
          );
          pos = linkNewline !== -1 ? linkNewline : markdown.length;
          continue;
        }
      }

      output += markdown.slice(pos, linkStart);
      pos = linkStart;
      continue;
    }

    // Handle emphasis/bold
    if ((markdown[pos] === "*" || markdown[pos] === "_") && !inCodeBlock) {
      const char = markdown[pos];
      const isDouble = markdown[pos + 1] === char;
      const startPos = pos;

      if (isDouble && !markdown[pos + 2]) {
        pos += 2;
        continue;
      }
      if (!isDouble && !markdown[pos + 1]) {
        pos++;
        continue;
      }

      pos += isDouble ? 2 : 1;
      const nextNewline = markdown.indexOf("\n", startPos);
      const content =
        nextNewline === -1
          ? markdown.slice(pos)
          : markdown.slice(pos, nextNewline);

      if (!content.trim()) {
        continue;
      }

      const endChar = content.indexOf(char);
      if (endChar === -1 || nextNewline !== -1) {
        // If we hit a newline or no closing marker, preserve as text
        output += markdown.slice(startPos, pos) + content;
        pos = nextNewline === -1 ? markdown.length : nextNewline;
      } else {
        const hasDoubleEnd = isDouble && content[endChar + 1] === char;
        if (isDouble === hasDoubleEnd) {
          // Found matching markers on same line
          output += markdown.slice(
            startPos,
            pos + endChar + (isDouble ? 2 : 1)
          );
          pos += endChar + (isDouble ? 2 : 1);
        } else {
          // Mismatched markers, complete it
          output +=
            markdown.slice(startPos, pos) + content + (isDouble ? "**" : "*");
          pos = markdown.length;
        }
      }
      continue;
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

  return output.trim();
}

function isLetter(char: string): boolean {
  return /[a-zA-Z]/.test(char);
}
