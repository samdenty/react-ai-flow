import { SerializedText } from "../Text.js";
import { doPaint } from "./canvas.js";

export let paintWorkletRegistered!: Promise<void>;

if (CSS.paintWorklet) {
  try {
    const workletBlob = new Blob([`(${paintWorklet})(${doPaint});`], {
      type: "text/javascript",
    });

    const workletUrl = URL.createObjectURL(workletBlob);

    paintWorkletRegistered = CSS.paintWorklet
      .addModule(workletUrl)
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
        return [];
      }

      static get inputArguments() {
        return ["<string>"];
      }

      paint(
        ctx: PaintRenderingContext2D,
        _geometry: PaintSize,
        _properties: PaintStylePropertyMapReadOnly,
        [stateStyleValue]: CSSStyleValue[]
      ) {
        let text: SerializedText;
        try {
          text = JSON.parse(JSON.parse(stateStyleValue.toString()));
        } catch {
          return;
        }

        paint(ctx, text);
      }
    }
  );
}
