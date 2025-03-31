# `textlines`

An efficient library for extracting text lines from a DOM element.

- Efficently tracks mutations to the DOM node and updates the in-memory state
- Uses a binary search to find wrapping points of each line
- Detects block elements and allows you to differentiate between wrapping newlines & block element induced newlines (`\r\n` vs `\n`)
- Easy to use methods exported

## Usage

```ts
import { extractLines, extractTextFromLines } from "textlines";

for (const line of extractLines(element)) {
  console.log(line.index, line.blockParent, line.innerText);
}

console.log(extractTextFromLines(element))
```
