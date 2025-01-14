# Optimistic Markdown Parser

A robust markdown parser designed for real-time editing that gracefully handles incomplete markdown syntax. This parser is particularly useful for applications requiring live preview functionality, where markdown might be in an incomplete state during user input.

## Features

- Handles incomplete markdown structures without breaking
- Supports common markdown elements:
  - HTML blocks with proper tag nesting
  - Tables with automatic column alignment
  - Lists and horizontal rules
  - Links with configurable default targets
  - Emphasis (bold/italic) and code blocks
  - Footnotes
- Provides options for loading states and link target configuration
- Preserves escaped characters
- Auto-closes unclosed tags when appropriate

## Installation

```bash
npm install optimistic-markdown
# or
yarn add optimistic-markdown
```

## Usage

```typescript
import { optimisticMarkdown } from "optimistic-markdown";

// Basic usage
const result = optimisticMarkdown("# Hello World");

// With options
const result = optimisticMarkdown("Check out [this link", {
  isLoading: false,
  markdownLinkTarget: "https://default-target.com",
});
```

## Options

The parser accepts an options object with the following properties:

```typescript
interface OptimisticMarkdownOptions {
  isLoading?: boolean; // Controls loading state behavior
  markdownLinkTarget?: string; // Default target for incomplete links
}
```

## Special Handling

### Tables

- Automatically maintains consistent column counts
- Generates proper separator lines
- Handles incomplete table rows

### Links

- Completes incomplete links with default target when provided
- Preserves link text when URL is missing

### HTML

- Tracks nested HTML tags
- Preserves HTML block integrity

### Emphasis and Code

- Handles incomplete emphasis markers (\* and \_)
- Supports both inline code (`) and fenced code blocks (```)
- Auto-closes unclosed emphasis and code blocks when appropriate

### Lists and Horizontal Rules

- Differentiates between list items and horizontal rules
- Handles incomplete checkbox syntax
- Preserves list structure during editing

## Examples

### Table Handling

```markdown
| Header 1       | Header 2  |
| -------------- | --------- |
| Content 1      | Content 2 |
| Incomplete row |
```

### Link Completion

```markdown
[Incomplete link -> [Incomplete link](https://default-target.com)
```

### Auto-closing Tags

```markdown
**Bold text -> **Bold text\*\*
`code block -> `code block`
```

## Error Handling

The parser is designed to be forgiving and will:

- Never throw errors for malformed input
- Always return a string output
- Preserve as much of the original formatting as possible
- Handle edge cases gracefully

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT License](LICENSE)
