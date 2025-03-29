import type { IMirror } from "@rrweb/types";
import type { ReplayPlugin, Replayer, playerConfig } from "rrweb";
import { Stagger, type Text } from "text-stagger";
import type { RecordedEvent, TextSnapshot } from "text-stagger-record";
import { removeTextAnimation } from "./removeTextAnimation.js";
import { ReplayMode, type ReplayOptions } from "./replay.js";

export function replayPlugin(
	events: RecordedEvent[],
	{
		mode,
		onFrame,
		...options
	}: ReplayOptions<ReplayMode.Hydrated | ReplayMode.Recorded>,
): ReplayPlugin & {
	options: Partial<playerConfig>;
	hydratedTexts: Map<number, Text>;
	hydratedStaggers: Map<number, Stagger>;
	ready(): Promise<void>;
} {
	if (mode === ReplayMode.Hydrated) {
		removeTextAnimation(events, options);
	}

	let nodeMirror: IMirror<Node>;
	let replayer: Replayer;
	let window: Window & typeof globalThis;

	const hydratedStaggers = new Map<number, Stagger>();
	const hydratedTexts = new Map<number, Text>();
	const initSnapshots = new Map<number, TextSnapshot>();

	function processEvent(event: RecordedEvent) {
		const { snapshots } = event;

		if (mode === ReplayMode.Hydrated) {
			for (const snapshot of snapshots) {
				hydrateTextSnapshot(snapshot);

				if (!initSnapshots.has(snapshot.elementId)) {
					initSnapshots.set(snapshot.elementId, snapshot);
				}
			}
		}

		if (snapshots.length) {
			onFrame?.();
		}
	}

	function hydrateTextSnapshot(snapshot: TextSnapshot) {
		const hydrated = hydratedTexts.get(snapshot.id);
		const initialized = initSnapshots.get(snapshot.elementId);

		if (initialized && hydrated) {
			if (snapshot.elements.length === hydrated.elements.length) {
				snapshot.elements.forEach((elementSnapshot, i) => {
					const hydratedElement = hydrated.elements[i]!;
					hydratedElement.progress = elementSnapshot.progress;
				});
			} else {
				hydrated.progress = snapshot.progress;
			}

			if (!snapshot.options && !snapshot.stagger.options) {
				return;
			}

			hydrated.dispose();
		}

		const element = nodeMirror.getNode(snapshot.elementId);
		if (!(element instanceof window.HTMLElement)) {
			return;
		}

		let stagger = hydratedStaggers.get(snapshot.stagger.id);

		if (!stagger || (initialized && snapshot.stagger.options)) {
			stagger = new Stagger({
				window: replayer.iframe.contentWindow! as Window & typeof globalThis,
				streaming: true,
				...snapshot.stagger.options,
			});

			if (!options.recalculateProgress) {
				stagger.pause();
			}

			hydratedStaggers.set(snapshot.stagger.id, stagger);
		}

		const text = stagger.observeText(element, {
			...snapshot.options,
			id: snapshot.id,
			// todo update
			animation: "blur-in",
			splitter: "word",
			delayTrailing: true,
			duration: 200,
			stagger: "100%",
		});

		hydratedTexts.set(snapshot.id, text);
	}

	return {
		hydratedStaggers,
		hydratedTexts,
		handler(event, _isSync: boolean, context) {
			replayer = context.replayer;
			window = replayer.iframe.contentWindow! as Window & typeof globalThis;

			processEvent(event as RecordedEvent);
		},
		async ready() {
			await Promise.all(
				[...hydratedStaggers.values()].map((stagger) => stagger.ready),
			);
		},
		onBuild: (_, { id }) => {
			const text = initSnapshots.get(id);

			if (text) {
				hydrateTextSnapshot(text);
			}
		},
		getMirror: (mirrors) => {
			nodeMirror = mirrors.nodeMirror;
		},
		options,
	};
}
