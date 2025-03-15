import "./index.css";
import { createRoot } from "react-dom/client";
import { record } from "text-stagger-record";
import { replay } from "text-stagger-replay";
import { Demo } from "./Demo.js";

const container = window.document.getElementById("root")!;
const root = createRoot(container);
root.render(<Demo />);

const stop = record();

setTimeout(() => {
	const events = stop();
	root.unmount();
	replay(events, {
		speed: 5,
		hydrateAnimations: {
			// recalculateProgress: true,
		},
	});
}, 2000);
