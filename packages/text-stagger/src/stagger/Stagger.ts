import { type Vibration, mergeVibrations } from "ios-vibrator-pro-max";
import { type ScanEvent, ScanReason } from "text-element-lines";
import { registerPaintWorklet } from "../text/canvas/paint-worklet.js";
import {
	type ParsedTextOptions,
	Text,
	TextLine,
	type TextOptions,
	mergeTextSplitter,
	resolveTextSplitter,
} from "../text/index.js";
import { StaggerElement } from "./StaggerElement.js";

export interface StaggerOptions extends TextOptions {
	streaming?: boolean | null;
	id?: number;
	window?: Window & typeof globalThis;
	restartOnSelection?: boolean;
	revealOnSelection?: boolean;
}

export interface ParsedStaggerOptions extends Omit<ParsedTextOptions, "id"> {
	restartOnSelection: boolean;
	revealOnSelection: boolean;
}

declare global {
	interface Window {
		staggers: Stagger[] | undefined;
	}
}

let ID = 0;
let TEXT_ID = 0;

export type PausableItem<T = StaggerElement> =
	| T
	| (T extends Stagger
			? never
			: T extends Text
				? Stagger
				: T extends TextLine
					? Stagger | Text
					: Stagger | Text | TextLine);

export enum PauseFlags {
	None = 0, //         0b000 - No pause
	Self = 1 << 0, //    0b001 - Paused by itself
	Parent = 1 << 1, //  0b010 - Paused by parent (Text)
	Stagger = 1 << 2, // 0b100 - Paused by Stagger
}

export interface PauseState {
	flags: number; // Bitfield using PauseFlags
	time: number | null; // Timestamp of last pause, null if unpaused
}

// text-stagger-record overwrites requestAnimationFrame and cancelAnimationFrame
const { requestAnimationFrame, cancelAnimationFrame } = globalThis;

export class Stagger {
	#options!: ParsedStaggerOptions;
	#optionsListeners = new Set<(options: ParsedStaggerOptions) => void>();
	#paintListeners = new Set<() => void>();
	#streaming: boolean | null = null;
	#streamingListeners = new Set<(streaming: boolean | null) => void>();

	#textsListeners = new Set<() => void>();
	#painter?: ReturnType<typeof requestAnimationFrame>;
	#paintQueue = new Set<Text>();
	#painting = false;
	#pauses = new Map<PausableItem, PauseState>();
	#pauseCache = new WeakMap<
		PausableItem,
		PauseState & { items: PausableItem[] }
	>();
	#invalidateTexts = true;

	#texts: Text[] = [];
	#elements?: StaggerElement[];

	batchId = 0;
	id: number;
	vibration?: Vibration;
	lastPaint?: number;

	window: Window & typeof globalThis;

	get ready() {
		return Promise.all(this.texts.map((text) => text.ready));
	}

	constructor({
		streaming,
		id,
		window = globalThis.window,
		...options
	}: StaggerOptions = {}) {
		this.id = id ?? ++ID;
		this.options = options;
		this.streaming = streaming ?? null;
		this.window = window;

		window.staggers ??= [];
		window.staggers.push(this);

		registerPaintWorklet(window);

		// Instantly reveal text on selection
		if (this.options.revealOnSelection) {
			this.window.document.addEventListener("selectionchange", () => {
				this.revealSelection();
			});
		}
	}

	#previousSelectionText?: string;

	revealSelection(restart = this.options.restartOnSelection) {
		const selection = this.window.getSelection();
		if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
			return;
		}

		const selectionRange = selection.getRangeAt(0);
		const selectionText = selection.toString();

		if (selectionText === this.#previousSelectionText) {
			return;
		}

		this.#previousSelectionText = selectionText;

		const elements = this.elements;

		let left = 0;
		let right = elements.length - 1;
		let firstOverlap = -1;

		// Binary search for first potential overlap
		while (left <= right) {
			const mid = Math.floor((left + right) / 2);
			const element = elements[mid]!;
			const lastRange = element.ranges[0]!;

			if (
				lastRange.compareBoundaryPoints(Range.START_TO_END, selectionRange) < 0
			) {
				left = mid + 1;
			} else {
				firstOverlap = mid;
				right = mid - 1;
			}
		}

		if (firstOverlap === -1) {
			return;
		}

		left = firstOverlap;
		right = elements.length - 1;
		let lastOverlap = firstOverlap;

		while (left <= right) {
			const mid = Math.floor((left + right) / 2);
			const element = elements[mid]!;
			const firstRange = element.ranges.at(-1)!;

			if (
				selectionRange.compareBoundaryPoints(Range.START_TO_END, firstRange) < 0
			) {
				right = mid - 1;
			} else {
				lastOverlap = mid;
				left = mid + 1;
			}
		}

		for (let i = firstOverlap; i <= lastOverlap; i++) {
			const element = elements[i];

			if (element) {
				element.progress = 1;

				if (element.isLast) {
					element.text.revealTrailing();
				}
			}
		}

		const lastElement = elements[lastOverlap];

		if (lastElement && (lastElement.active || restart)) {
			for (const element of this.elements) {
				element.progress = 1;
			}

			this.restartAnimationFrom(lastElement, {
				offset: 1,
			});
		}
	}

	play(items: PausableItem[] | PausableItem = this) {
		items = Array.isArray(items) ? items : [items];

		const now = Date.now();

		for (const item of items) {
			const current = this.#pauses.get(item) || {
				flags: PauseFlags.None,
				time: null,
			};

			let newFlags = current.flags;

			if (item instanceof Stagger) {
				newFlags &= ~PauseFlags.Stagger;
			} else if (item instanceof Text) {
				newFlags &= ~PauseFlags.Parent;
			} else {
				newFlags &= ~PauseFlags.Self;
			}

			// Update startTime for StaggerElements
			if (item instanceof StaggerElement && current.time !== null) {
				item.startTime = now + (item.startTime - current.time);
			} else if (item instanceof TextLine && current.time !== null) {
				for (const text of this.texts) {
					for (const element of text.elements) {
						if (element.lines.includes(item)) {
							element.startTime = now + (element.startTime - current.time);
						}
					}
				}
			} else if (item instanceof Text) {
				for (const element of this.unsortedElements) {
					const elementState = this.getPauseState(element);
					if (elementState.time !== null) {
						element.startTime = now + (element.startTime - elementState.time);
					}
				}
			} else if (item instanceof Stagger) {
				for (const element of this.unsortedElements) {
					const elementState = this.getPauseState(element);
					if (elementState.time !== null) {
						element.startTime = now + (element.startTime - elementState.time);
					}
				}
			}

			if (newFlags === PauseFlags.None) {
				this.#pauses.delete(item);
			} else {
				this.#pauses.set(item, { flags: newFlags, time: current.time });
			}

			// Invalidate cache for this item and its dependencies
			this.#pauseCache.delete(item);

			if (item instanceof Stagger) {
				for (const element of this.unsortedElements) {
					this.#pauseCache.delete(element);
				}

				for (const text of this.texts) {
					this.#pauseCache.delete(text);

					for (const line of text.lines) {
						this.#pauseCache.delete(line);
					}
				}
			} else if (item instanceof Text) {
				for (const line of item.lines) {
					this.#pauseCache.delete(line);
				}

				for (const element of item.elements) {
					this.#pauseCache.delete(element);
				}
			} else if (item instanceof TextLine) {
				for (const element of item.elements) {
					this.#pauseCache.delete(element);
				}
			}
		}
	}

	pause(items: PausableItem[] | PausableItem = this) {
		items = Array.isArray(items) ? items : [items];

		const now = Date.now();

		for (const item of items) {
			const current = this.#pauses.get(item) || {
				flags: PauseFlags.None,
				time: null,
			};

			let newFlags = current.flags;

			if (item instanceof Stagger) {
				newFlags |= PauseFlags.Stagger;
			} else if (item instanceof Text) {
				newFlags |= PauseFlags.Parent;
			} else {
				newFlags |= PauseFlags.Self;
			}

			this.#pauses.set(item, { flags: newFlags, time: now });

			// Invalidate cache for this item and its dependencies
			this.#pauseCache.delete(item);

			if (item instanceof Stagger) {
				for (const element of this.unsortedElements) {
					this.#pauseCache.delete(element);
				}

				for (const text of this.texts) {
					this.#pauseCache.delete(text);

					for (const line of text.lines) {
						this.#pauseCache.delete(line);
					}
				}
			} else if (item instanceof Text) {
				for (const line of item.lines) {
					this.#pauseCache.delete(line);
				}

				for (const element of item.elements) {
					this.#pauseCache.delete(element);
				}
			} else if (item instanceof TextLine) {
				for (const element of item.elements) {
					this.#pauseCache.delete(element);
				}
			}
		}
	}

	get paused(): boolean {
		const state = this.getPauseState(this);
		return state.flags !== PauseFlags.None;
	}

	get pauseTime(): number | null {
		const state = this.getPauseState(this);
		return state.time;
	}

	getPauseState<T extends PausableItem>(
		item: T,
	): PauseState & { items: PausableItem<T>[] } {
		const cached = this.#pauseCache.get(item);
		if (cached) {
			return cached as any;
		}

		let combinedFlags = PauseFlags.None;
		const times: number[] = [];
		const pausedItems: PausableItem[] = [];
		const visitedTexts = new Set<Text>();

		const selfState = this.#pauses.get(item) || {
			flags: PauseFlags.None,
			time: null,
		};

		combinedFlags |= selfState.flags;

		if (selfState.time !== null) {
			times.push(selfState.time);
			if (selfState.flags !== PauseFlags.None) pausedItems.push(item);
		}

		if (item instanceof StaggerElement) {
			for (const line of item.lines) {
				const lineState = this.#pauses.get(line) || {
					flags: PauseFlags.None,
					time: null,
				};

				combinedFlags |= lineState.flags;

				if (lineState.time !== null) {
					times.push(lineState.time);
					if (lineState.flags !== PauseFlags.None) {
						pausedItems.push(line);
					}
				}
			}

			const textState = this.#pauses.get(item.text) || {
				flags: PauseFlags.None,
				time: null,
			};

			combinedFlags |= textState.flags;

			if (textState.time !== null) {
				times.push(textState.time);
				if (textState.flags !== PauseFlags.None) {
					pausedItems.push(item.text);
				}
			}
		}

		if (item instanceof Text) {
			let currentText = item.parentText;

			while (currentText && !visitedTexts.has(currentText)) {
				visitedTexts.add(currentText);

				const parentState = this.#pauses.get(currentText) || {
					flags: PauseFlags.None,
					time: null,
				};

				combinedFlags |= parentState.flags;

				if (parentState.time !== null) {
					times.push(parentState.time);
					if (parentState.flags !== PauseFlags.None) {
						pausedItems.push(currentText);
					}
				}

				currentText = currentText.parentText;
			}
		}

		// Check Stagger's state for all items except when item is the Stagger itself
		if ((item as any) !== this) {
			const staggerState = this.#pauses.get(this) || {
				flags: PauseFlags.None,
				time: null,
			};

			combinedFlags |= staggerState.flags;

			if (staggerState.time !== null) {
				times.push(staggerState.time);
				if (staggerState.flags !== PauseFlags.None) {
					pausedItems.push(this);
				}
			}
		}

		const time = times.length > 0 ? Math.min(...times) : null;
		const result = { flags: combinedFlags, time, items: pausedItems };

		this.#pauseCache.set(item, result);
		return result as any;
	}

	dispose() {
		for (const text of this.texts) {
			text.dispose();
		}

		if (this.window.staggers) {
			this.window.staggers = this.window.staggers.filter(
				(stagger) => stagger !== this,
			);
		}
	}

	get innerText() {
		return this.elements.join("");
	}

	get width() {
		return Math.max(...this.texts.map((text) => text.width));
	}

	/**
	 * Allows you to hint to whether the stagger is currently streaming a response.
	 *
	 * If `null`, the streaming state is unknown.
	 * If `true` then certain streaming only enhancements are enabled.
	 * If `false` the streaming enhancements are disabled.
	 *
	 * @default null (unknown/disabled)
	 */
	get streaming() {
		return this.#streaming;
	}

	set streaming(streaming: boolean | null) {
		if (streaming === this.#streaming) {
			return;
		}

		const previousStreaming = this.#streaming;
		this.#streaming = streaming;
		this.requestAnimation(this.texts);

		if (previousStreaming === true && !streaming) {
			for (const text of this.texts) {
				text.revealTrailing();
			}
		}

		this.#streamingListeners.forEach((listener) => listener(streaming));
	}

	onDidChangeStreaming(listener: (streaming: boolean | null) => void) {
		this.#streamingListeners.add(listener);

		return () => {
			this.#streamingListeners.delete(listener);
		};
	}

	toString() {
		return this.texts.join("");
	}

	get texts() {
		if (this.#invalidateTexts) {
			this.#texts.sort((a, b) => {
				return a.comparePosition(b);
			});

			this.#invalidateTexts = false;
		}

		return this.#texts;
	}

	set texts(texts: Text[]) {
		this.#texts = texts;
		this.#textsListeners.forEach((listener) => listener());
	}

	get unsortedElements() {
		if (this.#elements) {
			return this.#elements;
		}

		return this.texts.flatMap((text) => text.elements);
	}

	get elements() {
		if (!this.#elements) {
			this.#elements = this.unsortedElements;

			this.#elements.sort((a, b) => {
				return a.comparePosition(b);
			});
		}

		return this.#elements;
	}

	invalidatePositions() {
		this.#invalidateTexts = true;
		this.#elements = undefined;
	}

	cancelPaint() {
		if (this.#painter) {
			cancelAnimationFrame(this.#painter);
			this.#painter = undefined;
		}
	}

	vibrate() {
		const elementVibrations = this.unsortedElements.flatMap(
			(element): Vibration[] => {
				if (!element.vibration) {
					return [];
				}

				return [[element.startTime + element.delay, element.vibration]];
			},
		);

		if (
			!isTouchDevice() ||
			!navigator.vibrate ||
			!elementVibrations?.length ||
			this !== this.window.staggers?.at(-1)
		) {
			return;
		}

		this.vibration = [
			Date.now(),
			mergeVibrations(elementVibrations, Date.now()),
		];

		navigator.vibrate(this.vibration[1]);
	}

	paint(texts: Text[] = []) {
		this.#painting = true;

		this.revealSelection();

		const queuedToPaint = new Set(texts);
		const skippedFrames = new Set<Text>();

		for (const element of this.unsortedElements) {
			const elapsed = element.elapsed;

			if (element.paused || elapsed < 0 || element.progress === 1) {
				continue;
			}

			if (element.text.shouldSkipFrame) {
				skippedFrames.add(element.text);
				continue;
			}

			element.progress = Math.min(1, elapsed / element.duration);
		}

		for (const text of this.texts) {
			if (text.updateBoundsOnPaint && !skippedFrames.has(text)) {
				text.updateBounds();
			}
		}

		if (queuedToPaint.size || this.#paintQueue.size) {
			for (const text of queuedToPaint) {
				text.paint();
			}

			while (this.#paintQueue.size) {
				const queue = [...this.#paintQueue];
				this.#paintQueue.clear();

				for (const text of queue) {
					if (!queuedToPaint.has(text)) {
						queuedToPaint.add(text);
						text.paint();
					}
				}
			}

			this.#paintListeners.forEach((listener) => listener());
		}

		this.#painting = false;

		return (
			skippedFrames.size ||
			this.unsortedElements.some((element) => element.progress !== 1)
		);
	}

	restartAnimationFrom(
		restartFrom: StaggerElement | Text,
		{
			resume = true,
			offset = 0,
		}: {
			resume?: boolean;
			offset?: number;
		} = {},
	) {
		let element!: StaggerElement | undefined;

		if (restartFrom instanceof Text) {
			element = restartFrom.elements[0];

			if (!element) {
				for (const text of restartFrom.previousTexts) {
					element = text.elements.at(-1) ?? element;
				}
			}
		} else if (restartFrom instanceof StaggerElement) {
			element = restartFrom;
		}

		let restartFromElementIndex = element && this.elements.indexOf(element);

		if (restartFromElementIndex == null || restartFromElementIndex === -1) {
			return false;
		}

		restartFromElementIndex += offset;

		if (!this.elements[restartFromElementIndex]) {
			return false;
		}

		for (let i = restartFromElementIndex; i < this.elements.length; i++) {
			this.elements[i]!.restartAnimation(resume);
		}

		this.vibrate();

		return true;
	}

	requestAnimation(force: Text[] = []) {
		for (const text of force) {
			this.#paintQueue.add(text);
		}

		if (this.#painting) {
			return;
		}

		this.#painter ??= requestAnimationFrame(() => {
			this.batchId++;
			this.#painter = undefined;

			if (this.paint()) {
				this.requestAnimation();
			}
		});
	}

	static classNamePrefix = "text-stagger";

	get options(): ParsedStaggerOptions {
		return this.#options;
	}

	set options(options: StaggerOptions | undefined) {
		this.#options = resolveTextSplitter<ParsedStaggerOptions>(
			{
				visualDebug: false,
				maxFps: null,
				disabled: false,
				classNamePrefix: Stagger.classNamePrefix,
				delayTrailing: false,
				vibration: [0, "70%", 10],
				restartOnSelection: false,
				revealOnSelection: true,
				stagger: "100%",
			},
			options,
		);

		this.#optionsListeners.forEach((listener) => listener(this.options));
	}

	onDidPaint(listener: () => void) {
		this.#paintListeners.add(listener);

		return () => {
			this.#paintListeners.delete(listener);
		};
	}

	onDidChangeOptions(listener: (options: ParsedStaggerOptions) => void) {
		this.#optionsListeners.add(listener);

		return () => {
			this.#optionsListeners.delete(listener);
		};
	}

	onDidChangeTexts(listener: () => void) {
		this.#textsListeners.add(listener);

		return () => {
			this.#textsListeners.delete(listener);
		};
	}

	getText(id: number): Text | null {
		return this.texts.find((text) => text.id === id) ?? null;
	}

	scanText({ id, ...props }: { id?: number } & (ScanEvent | object) = {}) {
		const event: ScanEvent =
			"reason" in props ? props : { reason: ScanReason.Force };

		const texts = id == null ? this.texts : [this.getText(id)];

		texts.forEach((text) => {
			text?.scanElementLines(event);
		});
	}

	observeText(
		container: HTMLElement,
		textOptions: TextOptions | null | undefined,
	) {
		const text = new Text(
			this,
			mergeTextSplitter<ParsedTextOptions>(
				{ id: TEXT_ID++, ...this.options },
				textOptions ?? {},
			),
		);

		this.texts = [...this.texts, text];
		text.container = container;

		this.window.staggers?.sort(({ texts: [a] }, { texts: [b] }) => {
			return (b && a?.comparePosition(b)) ?? 0;
		});

		return text;
	}
}

function isTouchDevice() {
	return (
		"ontouchstart" in window ||
		navigator.maxTouchPoints > 0 ||
		(navigator as any).msMaxTouchPoints > 0
	);
}
