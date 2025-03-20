import { useCallback } from "react";
import { useEffect } from "react";
import { enableDataUriRendering } from "text-stagger";
import type { RecordedEvent } from "text-stagger-record";
import { replay } from "text-stagger-replay";

export interface RunnerFrame {
	index: number;
	recordedEvents: RecordedEvent[];
	hydratedEvents: RecordedEvent[];
}
export interface RunnerProps {
	events: RecordedEvent[];
	startFrame?: number;
	endFrame?: number;
	onFrame: (frame: RunnerFrame) => void;
	onComplete: () => void;
}

export function Runner({
	events,
	onFrame,
	startFrame,
	endFrame,
	onComplete,
}: RunnerProps) {
	const player = replay(events, {
		mode: "compare",
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: not needed
	const iterateFrames = useCallback(async () => {
		for (const frame of player.frames()) {
			await frame.render("compare");

			if (startFrame && frame.index < startFrame) {
				continue;
			}

			if (endFrame && frame.index > endFrame) {
				break;
			}

			onFrame(frame);

			// we use clicks on body to signal callback done
			await new Promise((resolve) => ((window as any).next = resolve));
		}

		onComplete();
	}, []);

	useEffect(() => {
		iterateFrames();
	}, [iterateFrames]);

	return null;
}
