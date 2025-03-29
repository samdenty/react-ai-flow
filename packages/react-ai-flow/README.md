[![Demo](https://raw.githubusercontent.com/samdenty/react-ai-flow/refs/heads/main/assets/demo.gif)](https://react-ai-flow.com/)

# React AI Flow

React AI Flow is a library that allows you to stagger text animations.

## Usage


```bash
pnpm install react-ai-flow
```

```tsx
import { StaggerProvider, StaggeredText } from "react-ai-flow";

function App() {
  return (
    <StaggerProvider splitter="word" duration={500}>
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
