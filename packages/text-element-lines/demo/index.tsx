import { createRoot } from "react-dom/client";
import { Demo } from "./Demo.js";

const container = window.document.getElementById("root")!;
const root = createRoot(container);
root.render(<Demo />);
