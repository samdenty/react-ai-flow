# What sets this library apart?

[![Demo](./assets/demo.gif)](https://react-ai-flow.com/)

- This library uses a single canvas-rendered mask-image, so we can do pixel-level fade-in effects.
  - Other libraries can accomplish at most a per-character opacity animation with a HTML <span> soup
  - but... it means we have to have a custom algorithm
- This library also features a super customizable text splitter API. Pick a built-in splitter (character, word, line, sentence) or provide you own function that splits the visually rendered text on screen.

# Usage

## React

```bash
pnpm install react-ai-flow
```

```tsx
import { StaggerProvider, StaggeredText } from "react-ai-flow";

function App() {
  return (
    <StaggerProvider>
      <StaggeredText>
        {/* Fades in text */}
        Hello World

        {/* Then fades in the background of the code block */}
        <StaggeredText>
          <code>
            {/* Then fades in each letter inside the code block */}
            <StaggeredText>
              Hello world
            </StaggeredText>
          </code>
        </StaggeredText>
      </StaggeredText>
    </StaggerProvider>
  );
}
```


## Plain JS DOM API

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
