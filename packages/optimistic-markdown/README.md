# Optimistic Markdown Parser for AI Chat Applications

A specialized markdown parser designed for handling AI-generated markdown content in real-time chat applications. This parser ensures that partially generated or potentially malformed markdown from AI responses renders correctly without breaking the UI.

## Why This Parser?

When working with AI chat applications:

- AI models often generate markdown content in chunks or streams
- Responses may be cut off mid-generation
- Markdown syntax might be incomplete during streaming
- Traditional markdown parsers can break or display incorrectly with partial content

## Features

- Handles streaming AI responses gracefully
- Maintains clean rendering even with incomplete markdown
- Supports common AI chat elements:
  - Code blocks (prevents broken syntax highlighting)
  - Tables (maintains structure during generation)
  - Links (handles incomplete URLs)
  - Emphasis and formatting
  - HTML blocks
- Zero dependencies
- TypeScript ready

## Usage

```typescript
import { optimisticMarkdown } from "optimistic-markdown";

// Handle streaming AI response chunks
function processAIResponse(chunk: string) {
  const formattedMarkdown = optimisticMarkdown(chunk, {
    isLoading: true, // Indicates content is still being generated
  });

  // Update your UI with the formatted markdown
  updateChatUI(formattedMarkdown);
}
```

## Options

```typescript
interface OptimisticMarkdownOptions {
  isLoading?: boolean; // Whether the AI is still generating content
  markdownLinkTarget?: string; // Default target for incomplete links
}
```

## Common AI Chat Scenarios

### Incomplete Code Blocks

````
AI: Here's an example in Python:

```py
def hello_wor
````

-> Parser maintains code block integrity even when cut off

### Partial Tables

```markdown
AI: Here's the data:
| Model | Perf
| GPT-4 | 95.
```

-> Parser maintains table structure during generation

### Cut-off Formatting

```markdown
AI: This is \*\*very impor
```

-> Parser handles incomplete emphasis markers

## Implementation Notes

- The parser assumes content is being generated from left to right
- Optimized for streaming performance
- Safe to run on every chunk update
- Preserves original formatting where possible

## License

[MIT License](LICENSE)
