import {
	EventType,
	type IMirror,
	IncrementalSource,
	type RecordPlugin,
	type eventWithTime,
	type serializedElementNodeWithId,
	type serializedNodeWithId,
} from "@rrweb/types";
import equal from "fast-deep-equal";
import type { Text } from "text-stagger";
import type { RecordedEvent, StaggerSnapshot, TextSnapshot } from "./record.js";
import {
	originalRequestAnimationFrame,
	rafSyncFlush,
} from "./utils/rafSyncFlush.js";

export function textEmitPlugin() {
	let nodeMirror: IMirror<Node>;
	const recordedTexts = new Map<
		number,
		{
			text: Text;
			initSnapshot: TextSnapshot;
			lastSnapshot: TextSnapshot;
			updateIgnoredNodes: VoidFunction;
		}
	>();
	let pendingNewTexts = 0;

	const events: RecordedEvent[] = [];

	function getTextSnapshot(text: Text): TextSnapshot {
		const stagger: StaggerSnapshot = {
			id: text.stagger.id,
			options: text.stagger.options,
		};

		return {
			id: text.id,
			progress: text.progress,
			options: text.options,
			elementId: nodeMirror.getId(text.container),
			elements: text.elements.map((element) => ({
				id: element.id,
				progress: element.progress,
			})),
			stagger,
			customAnimationClassName: text.customAnimationClassName,
		};
	}

	function processEvent(event: eventWithTime): RecordedEvent {
		const allTexts = window.staggers?.flatMap((stagger) => stagger.texts);

		if (event.type === EventType.FullSnapshot) {
			findTextsInNode(event.data.node);
		}

		if (
			event.type === EventType.IncrementalSnapshot &&
			event.data.source === IncrementalSource.Mutation
		) {
			for (const attribute of event.data.attributes) {
				const className = attribute.attributes.class;
				if (typeof className !== "string") {
					continue;
				}

				searchNodeId(attribute.id);
			}

			for (const add of event.data.adds) {
				searchNodeId(add.node.id);
			}
		}

		for (const recordedText of recordedTexts.values()) {
			recordedText.updateIgnoredNodes();
		}

		return {
			...event,
			snapshots: [],
		};

		async function searchNodeId(id: number) {
			const ref = nodeMirror.getNode(id);
			if (!ref) {
				return;
			}

			const text = allTexts?.find((text) => text.container === ref);
			if (!text || recordedTexts.has(text.id)) {
				return;
			}

			pendingNewTexts++;

			await text.ready;

			await new Promise(requestAnimationFrame);

			rafSyncFlush();

			const ignoredNodes = new WeakSet<Node>();
			const ignoredNodeIds = new Set<number>();

			const initSnapshot = {
				...getTextSnapshot(text),
				ignoredNodeIds: [] as number[],
			};

			const updateIgnoredNodes = () => {
				for (const ignoredNode of text.ignoredNodes) {
					if (ignoredNodes.has(ignoredNode)) {
						continue;
					}

					const id = nodeMirror.getId(ignoredNode);

					if (id !== -1) {
						ignoredNodes.add(ignoredNode);
						ignoredNodeIds.add(id);
					}
				}

				initSnapshot.ignoredNodeIds = [...ignoredNodeIds];
			};

			updateIgnoredNodes();

			recordedTexts.set(text.id, {
				text,
				initSnapshot,
				lastSnapshot: initSnapshot,
				updateIgnoredNodes,
			});
			pendingNewTexts--;
		}

		function findTextsInNode(
			node: serializedElementNodeWithId | serializedNodeWithId,
		) {
			searchNodeId(node.id);

			if (!("childNodes" in node)) {
				return;
			}

			for (const child of node.childNodes) {
				findTextsInNode(child);
			}
		}
	}

	function getSnapshotDiff(latestSnapshot: TextSnapshot, update: boolean) {
		const recorded = recordedTexts.get(latestSnapshot.id);

		if (!recorded) {
			return null;
		}

		const options = latestSnapshot.options ?? recorded.lastSnapshot.options;
		const stagger: StaggerSnapshot = {
			id: latestSnapshot.stagger.id,
			options:
				latestSnapshot.stagger.options ?? recorded.lastSnapshot.stagger.options,
		};

		const optionsEqual =
			recorded.initSnapshot !== recorded.lastSnapshot &&
			equal(recorded.lastSnapshot.options, options);
		const staggerEqual =
			recorded.initSnapshot !== recorded.lastSnapshot &&
			equal(recorded.lastSnapshot.stagger, stagger);

		if (
			optionsEqual &&
			staggerEqual &&
			recorded.lastSnapshot.progress === latestSnapshot.progress
		) {
			return null;
		}

		if (update) {
			recorded.lastSnapshot = {
				...latestSnapshot,
				options,
				stagger,
			};
		}

		return {
			...latestSnapshot,
			ignoredNodeIds: recorded.initSnapshot.ignoredNodeIds,
			options: optionsEqual ? undefined : latestSnapshot.options,
			stagger: staggerEqual
				? { id: latestSnapshot.stagger.id }
				: latestSnapshot.stagger,
		};
	}

	let lastEvent!: RecordedEvent;
	const pushStack: RecordedEvent[][] = [events];
	let ticker: number;

	function tick() {
		const pushTo = pushStack.at(-1)!;

		ticker = originalRequestAnimationFrame(tick);

		if (pendingNewTexts) {
			return;
		}

		const snapshots = [...recordedTexts.values()].flatMap(
			(recorded): TextSnapshot | [] => {
				const latestSnapshot = getTextSnapshot(recorded.text);

				return getSnapshotDiff(latestSnapshot, true) ?? [];
			},
		);

		if (snapshots.length) {
			rafFlush(pushTo);

			lastEvent.snapshots = snapshots;
		}
	}

	function rafFlush(pushTo: RecordedEvent[]) {
		const items: RecordedEvent[] = [];
		pushStack.push(items);

		rafSyncFlush();

		pushStack.pop();
		pushTo.push(...items);
	}

	tick();

	return {
		name: "text-stagger/emitTextPlugin@1",
		eventProcessor: (event) => {
			return processEvent(event);
		},
		getMirror: (mirrors) => {
			nodeMirror = mirrors.nodeMirror;
		},
		addSnapshots(event: RecordedEvent) {
			const pushTo = pushStack.at(-1)!;
			pushTo.push(event);
			lastEvent = event;

			rafFlush(pushTo);
		},
		dispose() {
			cancelAnimationFrame(ticker);
		},
		events,
		options: {},
	} satisfies RecordPlugin & Record<string, any>;
}
