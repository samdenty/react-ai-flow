import type {
	serializedElementNodeWithId,
	serializedNodeWithId,
} from "@rrweb/types";
import { EventType, IncrementalSource } from "rrweb";
import type { RecordedEvent } from "text-stagger-record";

export interface RemoveTextAnimationOptions {
	recalculateProgress?: boolean;
	recalculateOptions?: boolean;
}

export function removeTextAnimation(
	events: RecordedEvent[],
	{ recalculateOptions, recalculateProgress }: RemoveTextAnimationOptions = {},
) {
	const texts = events.flatMap((event) =>
		event.snapshots.filter((snapshot) => !!snapshot.ignoredNodeIds),
	);
	const ignoredStyleId = findIgnoredStyleId();
	const ignoredNodeIds = new Set(texts.flatMap((text) => text.ignoredNodeIds));

	function isIgnoredRule(rule: string) {
		return texts.some((text) =>
			rule.startsWith(`.${text.customAnimationClassName}`),
		);
	}

	function findIgnoredStyleId() {
		for (const event of events) {
			if (event.type !== EventType.IncrementalSnapshot) {
				continue;
			}

			if (event.data.source === IncrementalSource.AdoptedStyleSheet) {
				for (const style of event.data.styles ?? []) {
					for (const rule of style.rules) {
						if (isIgnoredRule(rule.rule)) {
							return style.styleId;
						}
					}
				}
			}

			if (event.data.source === IncrementalSource.StyleSheetRule) {
				for (const style of event.data.adds ?? []) {
					if (isIgnoredRule(style.rule)) {
						return event.data.styleId;
					}
				}
			}
		}

		return null;
	}

	function filterIgnoredEvent(event: RecordedEvent) {
		function filterSnapshots(include: boolean) {
			if (include) {
				return true;
			}

			{
				let i = 0;
				while (i < event.snapshots.length) {
					const snapshot = event.snapshots[i]!;

					if (
						recalculateProgress &&
						(recalculateOptions ||
							(!snapshot.options && !snapshot.stagger.options))
					) {
						event.snapshots.splice(i, 1);
					} else {
						i++;
					}
				}
			}

			if (!event.snapshots.length) {
				return false;
			}

			event.type = EventType.Custom;
			event.data = {
				tag: "snapshot",
				payload: null,
			};

			return true;
		}

		if (event.type === EventType.FullSnapshot) {
			return filterSnapshots(filterIgnoredNode(event.data.node));
		}

		if (event.type !== EventType.IncrementalSnapshot) {
			return true;
		}

		if (event.data.source === IncrementalSource.StyleDeclaration) {
			return filterSnapshots(
				!event.data.styleId || event.data.styleId !== ignoredStyleId,
			);
		}

		if (event.data.source === IncrementalSource.AdoptedStyleSheet) {
			event.data.styles = event.data.styles?.filter(
				({ styleId }) => styleId !== ignoredStyleId,
			);

			event.data.styleIds = event.data.styleIds.filter(
				(styleId) => styleId !== ignoredStyleId,
			);

			return filterSnapshots(!!event.data.styleIds.length);
		}

		if (event.data.source === IncrementalSource.StyleSheetRule) {
			return filterSnapshots(event.data.styleId !== ignoredStyleId);
		}

		if (event.data.source === IncrementalSource.Mutation) {
			event.data.adds = event.data.adds.filter(({ node, parentId }) => {
				return filterIgnoredNode(node, ignoredNodeIds.has(parentId));
			});
			event.data.attributes = event.data.attributes.filter(
				({ id }) => !ignoredNodeIds.has(id),
			);
			event.data.removes = event.data.removes.filter(
				({ id }) => !ignoredNodeIds.has(id),
			);

			return filterSnapshots(
				!!(
					event.data.texts.length ||
					event.data.adds.length ||
					event.data.attributes.length ||
					event.data.removes.length
				),
			);
		}

		return filterSnapshots(true);
	}

	function filterIgnoredNode(
		node: serializedElementNodeWithId | serializedNodeWithId,
		ignored?: boolean,
	) {
		ignored ||= ignoredNodeIds.has(node.id);

		if ("childNodes" in node) {
			node.childNodes = node.childNodes.filter((node) =>
				filterIgnoredNode(node, ignored),
			);
		}

		if (ignored) {
			ignoredNodeIds.add(node.id);
		}

		return !ignored;
	}

	let i = 0;
	while (i < events.length) {
		const event = events[i]!;

		if (!filterIgnoredEvent(event)) {
			events.splice(i, 1);
		} else {
			i++;
		}
	}

	return events;
}
