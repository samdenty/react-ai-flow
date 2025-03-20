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
	customAnimationClassName: string;
	stagger: StaggerSnapshot;
	options?: ParsedTextOptions;
	ignoredNodeIds?: number[];
}

export type RecordedEvent = eventWithTime & {
	snapshots: TextSnapshot[];
};

let recorders = 0;

export function record() {
	enableDataUriRendering(true);

	const textEmitter = textEmitPlugin();

	const stop = rrwebRecord({
		recordCanvas: true,
		plugins: [textEmitter],
		emit(event: RecordedEvent) {
			textEmitter.addSnapshots(event);
		},
	});

	return () => {
		stop?.();
		textEmitter.dispose();

		recorders--;

		enableDataUriRendering(!!recorders);

		return textEmitter.events;
	};
}
