import { type eventWithTime, record as rrwebRecord } from "rrweb";
import {
	type ParsedStaggerOptions,
	type ParsedTextOptions,
	enableDataUriRendering,
} from "text-stagger";
import { textEmitPlugin } from "./textEmitPlugin.js";

export interface StaggerSnapshot {
	id: number;
	options?: ParsedStaggerOptions;
}

export interface ElementSnapshot {
	id: number;
	progress: number;
}

export interface TextSnapshot {
	id: number;
	elementId: number;
	progress: number;
	elements: ElementSnapshot[];
	stagger: StaggerSnapshot;
	options?: ParsedTextOptions;
}

export interface TextInit extends TextSnapshot {
	ignoredNodeIds: number[];
	customAnimationClassName: string;
}

export type RecordedEvent = eventWithTime & {
	inits: TextInit[];
	snapshots: TextSnapshot[];
};

let recorders = 0;

export function record() {
	enableDataUriRendering(true);

	const events: RecordedEvent[] = [];

	const textEmitter = textEmitPlugin();

	let snapshot = false;
	let nextFrame: number | null;

	const stop = rrwebRecord({
		recordCanvas: true,
		plugins: [textEmitter],
		emit(event: RecordedEvent) {
			nextFrame ??= requestAnimationFrame(() => {
				snapshot = true;
				nextFrame = null;
			});

			if (snapshot) {
				event.snapshots = textEmitter.getTextSnapshots();
				snapshot = false;
			}

			events.push(event);
		},
	});

	return () => {
		stop?.();

		recorders--;

		enableDataUriRendering(!!recorders);

		return events;
	};
}
