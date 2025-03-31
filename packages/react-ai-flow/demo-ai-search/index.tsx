import "./index.css";
import { createRoot } from "react-dom/client";
import { AISearchDemo } from "./AISearchDemo.js";

const container = window.document.getElementById("root")!;
const root = createRoot(container);
root.render(<AISearchDemo />);
