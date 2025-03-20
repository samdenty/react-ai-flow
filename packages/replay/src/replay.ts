import { Replayer } from "rrweb";
import type { RecordedEvent, TextSnapshot } from "text-stagger-record";
import type { RemoveTextAnimationOptions } from "./removeTextAnimation.js";
import { replayPlugin } from "./replayPlugin.js";
import { getFrames } from "./frames.js";

export enum ReplayMode {
	Recorded = "recorded",
	Hydrated = "hydrated",
	Compare = "compare",
}

export interface ReplayOptions<T extends ReplayMode>
	extends RemoveTextAnimationOptions {
	mode?: T | `${T}`;

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

	onFrame?: () => void;
}

export interface Frame<T extends ReplayMode> {
	index: number;
	recordedEvents: T extends ReplayMode.Compare | ReplayMode.Recorded
		? RecordedEvent[]
		: null;
	hydratedEvents: T extends ReplayMode.Compare | ReplayMode.Hydrated
		? RecordedEvent[]
		: null;
	render: T extends ReplayMode.Compare
		? (frame: ReplayMode | `${ReplayMode}`) => Promise<void>
		: () => void;
	snapshots: TextSnapshot[];
}

export interface Player<T extends ReplayMode> {
	recorded: T extends ReplayMode.Compare | ReplayMode.Recorded
		? Replayer
		: null;
	hydrated: T extends ReplayMode.Compare | ReplayMode.Hydrated
		? Replayer
		: null;

	frames: () => Generator<Frame<T>>;
}

export function replay<T extends ReplayMode = ReplayMode.Hydrated>(
	events: RecordedEvent[],
	{ mode = ReplayMode.Hydrated as T, ...options }: ReplayOptions<T> = {},
): Player<T> {
	const textFrames = getFrames(events).map(
		({
			snapshots,
			events,
		}): {
			snapshots: TextSnapshot[];
			recordedEvents: RecordedEvent[];
			hydratedEvents: RecordedEvent[];
		} => ({
			snapshots,
			recordedEvents: events,
			hydratedEvents: [],
		}),
	);

	let recorded = null as Player<T>["recorded"];
	let hydrated = null as Player<T>["hydrated"];
	let hydratedReplay: ReturnType<typeof replayPlugin> | null = null;

	if (mode === "compare" || mode === "recorded") {
		const recordedReplay = replayPlugin(events, {
			...options,
			mode: ReplayMode.Recorded,
		});

		recorded = new Replayer(events, {
			mouseTail: false,
			UNSAFE_replayCanvas: true,
			...recordedReplay.options,
			plugins: [recordedReplay],
		}) as any;

		recorded!.iframe.style.pointerEvents = "auto";
	}

	if (mode === "compare" || mode === "hydrated") {
		const hydratedEvents = JSON.parse(
			JSON.stringify(events),
		) as RecordedEvent[];

		hydratedReplay = replayPlugin(hydratedEvents, {
			...options,
			mode: ReplayMode.Hydrated,
		});

		let lastEnd = 0;
		let snapshotIndex = 0;

		hydratedEvents.forEach(({ snapshots }, index) => {
			if (snapshots.length) {
				const start = lastEnd;
				const end = index + 1;
				lastEnd = end;

				textFrames[snapshotIndex++]!.hydratedEvents = hydratedEvents.slice(
					start,
					end,
				);
			}
		});

		hydrated = new Replayer(hydratedEvents, {
			mouseTail: false,
			UNSAFE_replayCanvas: true,
			...hydratedReplay.options,
			plugins: [hydratedReplay],
		}) as any;

		hydrated!.iframe.style.pointerEvents = "auto";
	}

	function* frames(): Generator<Frame<ReplayMode>> {
		if (recorded) {
			recorded.pause();
			recorded.config.useVirtualDom = false;
		}

		if (hydrated) {
			hydrated.pause();
			hydrated.config.useVirtualDom = false;
		}

		let i = 0;
		let lastEnd = 0;

		for (const frame of textFrames) {
			const frameIndex = i++;

			const render = async (renderMode = mode) => {
				if (recorded) {
					recorded.iframe.style.position = "absolute";
					recorded.iframe.style.opacity = "0";
				}

				if (hydrated) {
					hydrated.iframe.style.opacity = "0";
					hydrated.iframe.style.position = "absolute";
				}

				const start = lastEnd;
				const end = frameIndex + 1;
				lastEnd = end;

				const snapshots = textFrames.slice(start, end);

				if (
					renderMode === ReplayMode.Recorded ||
					renderMode === ReplayMode.Compare
				) {
					recorded!.iframe.style.opacity = "1";
					recorded!.iframe.style.position = "";

					for (const recordedEvent of snapshots.flatMap(
						(f) => f.recordedEvents,
					)) {
						(recorded as any)?.getCastFn(recordedEvent, true)();
					}
				}

				if (
					renderMode === ReplayMode.Hydrated ||
					renderMode === ReplayMode.Compare
				) {
					hydrated!.iframe.style.opacity = "1";
					hydrated!.iframe.style.position = "";

					for (const hydratedEvent of snapshots.flatMap(
						(f) => f.hydratedEvents,
					)) {
						(hydrated as any)?.getCastFn(hydratedEvent, true)();
					}

					await hydratedReplay!.ready();
				}
			};

			yield {
				index: frameIndex,
				render,
				hydratedEvents: frame.hydratedEvents,
				recordedEvents: frame.recordedEvents,
				snapshots: frame.snapshots,
			};
		}
	}

	if (mode !== ReplayMode.Compare) {
		hydrated?.play();
		recorded?.play();
	}

	return {
		recorded,
		hydrated,
		frames,
	};
}
