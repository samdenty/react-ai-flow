import type { CustomStyles } from "../stagger/index.js";
import type { StaggerElementBox } from "../stagger/StaggerElementBox.js";

export type BlurAmount = string | number;

export function blurIn(box: StaggerElementBox, blurAmount: BlurAmount = 8) {
	const styles: CustomStyles = {};

	if (typeof blurAmount === "string") {
		blurAmount = box.text.convertToPx(blurAmount, box);
	}

	styles.filter ||= `blur(${((1 - box.timing) * blurAmount).toFixed(2)}px)`;
	styles.opacity ||= `${box.timing.toFixed(2)}`;

	return styles;
}
