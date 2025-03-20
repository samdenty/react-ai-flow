import type { SerializedText } from "../Text.js";
import { doPaint } from "./canvas.js";

const registered = new WeakSet<Window & typeof globalThis>();

registerPaintWorklet();

export function registerPaintWorklet({ CSS } = globalThis) {
	if (registered.has(window)) {
		return;
	}

	registered.add(window);

	try {
		const workletBlob = new Blob([`(${paintWorklet})(${doPaint});`], {
			type: "text/javascript",
		});

		const workletUrl = URL.createObjectURL(workletBlob);

		CSS.paintWorklet
			?.addModule(workletUrl)
			.then(() => URL.revokeObjectURL(workletUrl));
	} catch (error) {
		console.error("Failed to register paint worklet:", error);
	}
}

function paintWorklet(paint: typeof doPaint) {
	globalThis.registerPaint(
		"text-stagger",
		class PaintWorklet {
			static get inputProperties() {
				return ["--text-stagger"];
			}

			static get inputArguments() {
				return ["<string>"];
			}

			paint(
				ctx: PaintRenderingContext2D,
				_geometry: PaintSize,
				properties: PaintStylePropertyMapReadOnly,
				[stateStyleValue]: CSSStyleValue[],
			) {
				let text: SerializedText;

				try {
					if (stateStyleValue) {
						text = JSON.parse(JSON.parse(stateStyleValue.toString() ?? ""));
					} else {
						text = JSON.parse(
							JSON.parse(properties.get("--text-stagger")?.toString()),
						);
					}
				} catch {
					return;
				}

				paint(ctx, text);
			}
		},
	);
}
