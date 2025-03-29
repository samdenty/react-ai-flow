import { type eventWithTime, record as rrwebRecord } from "rrweb";
import {
	type ParsedStaggerOptions,
	type ParsedTextOptions,
	enableDataUriRendering,
} from "text-stagger";
import { textEmitPlugin } from "./textEmitPlugin.js";

export interface StaggerSnapshot {
	id: number;
	streaming: boolean | null;
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
	options?: Omit<ParsedTextOptions, "splitText"> & { splitText: string };
	ignoredNodeIds?: number[];
}

export type RecordedEvent = eventWithTime & {
	snapshots: TextSnapshot[];
};

let recorders = 0;

export function record() {
	enableDataUriRendering(true);

	const textEmitter = textEmitPlugin();

	const style = window.document.createElement("style");
	style.innerText = "* { font-family: Verdana !important }";
	window.document.head.appendChild(style);

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
		style.remove();

		recorders--;

		enableDataUriRendering(!!recorders);

		return textEmitter.events;
	};
}
