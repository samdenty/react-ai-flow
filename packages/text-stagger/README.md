[![Demo](https://raw.githubusercontent.com/samdenty/react-ai-flow/refs/heads/main/assets/demo.gif)](https://react-ai-flow.com/)

# Text Stagger

Text Stagger is a library that allows you to stagger text animations.

## Usage


```bash
pnpm install text-stagger
```

```ts
import { Stagger } from "text-stagger";

// Create a stagger orchestrator instance
const stagger = new Stagger({
  // options to pass
});

// Create a text instance
const text = stagger.observeText(someDivContainingText, {
  splitter: 'word',
  duration: 500,
});
```
