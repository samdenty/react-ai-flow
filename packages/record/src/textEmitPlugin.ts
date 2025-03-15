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
import type {
	RecordedEvent,
	StaggerSnapshot,
	TextInit,
	TextSnapshot,
} from "./record.js";

export function textEmitPlugin() {
	let nodeMirror: IMirror<Node>;
	const recordedTexts = new Map<
		number,
		{
			text: Text;
			lastSnapshot: TextSnapshot;
			updateIgnoredNodes: VoidFunction;
		}
	>();

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
		};
	}

	function processEvent(event: eventWithTime): RecordedEvent {
		const allTexts = window.staggers?.flatMap((stagger) => stagger.texts);
		const newTexts = new Map<number, TextInit>();

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
			inits: [...newTexts.values()],
		};

		function searchNodeId(id: number) {
			const ref = nodeMirror.getNode(id);
			if (!ref) {
				return;
			}

			const text = allTexts?.find((text) => text.container === ref);
			if (!text || recordedTexts.has(text.id)) {
				return;
			}

			const ignoredNodes = new WeakSet<Node>();
			const ignoredNodeIds = new Set<number>();

			const initSnapshot = getTextSnapshot(text);

			const textInit: TextInit = {
				...initSnapshot,
				customAnimationClassName: text.customAnimationClassName,
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

				textInit.ignoredNodeIds = [...ignoredNodeIds];
			};

			updateIgnoredNodes();

			newTexts.set(text.id, textInit);
			recordedTexts.set(text.id, {
				text,
				lastSnapshot: initSnapshot,
				updateIgnoredNodes,
			});
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

	return {
		name: "text-stagger/emitTextPlugin@1",
		eventProcessor: (event) => {
			return processEvent(event);
		},
		getMirror: (mirrors) => {
			nodeMirror = mirrors.nodeMirror;
		},
		getTextSnapshots() {
			return [...recordedTexts.values()].flatMap(
				(recorded): TextSnapshot | [] => {
					const latestSnapshot = getTextSnapshot(recorded.text);

					const optionsEqual = equal(
						recorded.lastSnapshot.options,
						latestSnapshot.options,
					);

					const staggerEqual = equal(
						recorded.lastSnapshot.stagger,
						latestSnapshot.stagger,
					);

					if (
						optionsEqual &&
						staggerEqual &&
						recorded.lastSnapshot.progress === latestSnapshot.progress
					) {
						return [];
					}

					recorded.lastSnapshot = latestSnapshot;

					return {
						...latestSnapshot,
						options: optionsEqual ? undefined : latestSnapshot.options,
						stagger: staggerEqual
							? { id: latestSnapshot.stagger.id }
							: latestSnapshot.stagger,
					};
				},
			);
		},
		options: {},
	} satisfies RecordPlugin & Record<string, any>;
}
