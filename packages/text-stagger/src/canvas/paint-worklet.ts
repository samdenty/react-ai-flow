import { AnimationState, doPaint } from "./canvas.js";

export let paintWorkletRegistered!: Promise<void>;

if (CSS.paintWorklet) {
  try {
    const workletBlob = new Blob(
      [`const doPaint = (${doPaint});\n(${paintWorklet})();`],
      {
        type: "text/javascript",
      }
    );

    const workletUrl = URL.createObjectURL(workletBlob);

    paintWorkletRegistered = CSS.paintWorklet
      .addModule(workletUrl)
      .then(() => URL.revokeObjectURL(workletUrl));
  } catch (error) {
    console.error("Failed to register paint worklet:", error);
  }
}

function paintWorklet() {
  globalThis.registerPaint(
    "staggered-text",
    class PaintWorklet {
      static get inputProperties() {
        return ["--state"];
      }

      paint(
        ctx: PaintRenderingContext2D,
        _geometry: PaintSize,
        properties: PaintStylePropertyMapReadOnly
      ) {
        let state: AnimationState;
        try {
          state = JSON.parse(properties.get("--state").toString());
        } catch {
          return;
        }

        doPaint(ctx, state);
      }
    }
  );
}
