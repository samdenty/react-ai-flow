import { enableBackgroundPopup } from "ios-vibrator-pro-max";

export * from "./text/index.js";
export * from "./stagger/index.js";

export function enableIOSVibrationWithPopup(enabled = true) {
	enableBackgroundPopup(enabled);
}
