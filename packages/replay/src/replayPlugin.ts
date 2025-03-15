import type { IMirror } from "@rrweb/types";
import type { ReplayPlugin, Replayer, playerConfig } from "rrweb";
import { Stagger, type Text } from "text-stagger";
import type { RecordedEvent, TextSnapshot } from "text-stagger-record";
import { removeTextAnimation } from "./removeTextAnimation.js";
import type { ReplayOptions } from "./replay.js";

export function replayPlugin(
	events: RecordedEvent[],
	{ hydrateAnimations, ...options }: ReplayOptions,
): ReplayPlugin & { options: Partial<playerConfig> } {
	if (!hydrateAnimations) {
		return { options };
	}

	const hydrateAnimationOptions =
		typeof hydrateAnimations === "object" ? hydrateAnimations : {};

	removeTextAnimation(events, hydrateAnimationOptions);

	let nodeMirror: IMirror<Node>;
	let replayer: Replayer;
	let window: Window & typeof globalThis;

	const hydratedStaggers = new Map<number, Stagger>();
	const hydratedTexts = new Map<number, Text>();
	const initSnapshots = new Map<number, TextSnapshot>();

	function processEvent(event: RecordedEvent) {
		const { inits, snapshots } = event;

		for (const snapshot of inits) {
			hydrateTextSnapshot(snapshot);
			initSnapshots.set(snapshot.elementId, snapshot);
		}

		for (const snapshot of snapshots) {
			hydrateTextSnapshot(snapshot);
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
				...snapshot.stagger.options,
			});

			if (!hydrateAnimationOptions.recalculateProgress) {
				stagger.pause();
			}

			hydratedStaggers.set(snapshot.stagger.id, stagger);
		}

		stagger.observeText(element, snapshot.id, snapshot.options);
		hydratedTexts.set(snapshot.id, stagger.getText(snapshot.id)!);
	}

	return {
		handler(event, _isSync: boolean, context) {
			replayer = context.replayer;
			window = replayer.iframe.contentWindow! as Window & typeof globalThis;

			processEvent(event as RecordedEvent);
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
