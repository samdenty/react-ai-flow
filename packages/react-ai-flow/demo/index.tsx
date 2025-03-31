import "./index.css";
import { createRoot } from "react-dom/client";
import { record } from "text-stagger-record";
import { ReplayMode, replay } from "text-stagger-replay";
import { Demo } from "./Demo.js";

const container = window.document.getElementById("root")!;
const root = createRoot(container);
root.render(<Demo />);

// const stop = record();

// setTimeout(async () => {
// 	const events = stop();
// 	root.unmount();

// 	console.log(events);

// 	// events = await import(
// 	// 	"../../../e2e/tests/demo/blur-in-visualDebug.json"
// 	// ).then((res) => res.default);

// 	const replayer = replay(events, {
// 		// speed: 5,
// 		mode: ReplayMode.Compare,
// 	});

// 	for (const frame of replayer.frames()) {
// 		await frame.render();

// 		await new Promise(requestAnimationFrame);
// 		console.log(frame.index);
// 	}
// }, 2000);
