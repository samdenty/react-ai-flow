import { Replayer } from "rrweb";
import type { RecordedEvent } from "text-stagger-record";
import type { RemoveTextAnimationOptions } from "./removeTextAnimation.js";
import { replayPlugin } from "./replayPlugin.js";

export interface ReplayOptions {
	hydrateAnimations?: boolean | RemoveTextAnimationOptions;
	speed?: number;
	maxSpeed?: number;
	mouseTail?:
		| boolean
		| {
				duration?: number;
				lineCap?: string;
				lineWidth?: number;
				strokeStyle?: string;
		  };
}

export function replay(events: RecordedEvent[], options: ReplayOptions = {}) {
	const replay = replayPlugin(events, options);

	const replayer = new Replayer(events, {
		mouseTail: false,
		UNSAFE_replayCanvas: true,
		...replay.options,
		plugins: [replay],
	});

	replayer.iframe.style.pointerEvents = "auto";

	replayer.play();
}
