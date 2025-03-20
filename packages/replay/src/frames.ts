import type { RecordedEvent, TextSnapshot } from "text-stagger-record";

export function getFrames(events: RecordedEvent[]) {
	const frames: {
		snapshots: TextSnapshot[];
		events: RecordedEvent[];
	}[] = [];

	let lastEnd = 0;

	events.forEach(({ snapshots }, index) => {
		if (snapshots.length) {
			const start = lastEnd;
			const end = index + 1;
			lastEnd = end;

			frames.push({
				snapshots,
				events: events.slice(start, end),
			});
		}
	});

	return frames;
}
