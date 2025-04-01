import {
	AnimationKind,
	type CustomStyles,
} from "../../stagger/StaggerElement.js";
import type { StaggerElementBox } from "../../stagger/StaggerElementBox.js";

export function getCustomAnimationStyles(
	box: StaggerElementBox,
): CustomStyles | null {
	const { animation } = box.element;
	let { blurAmount = 8, customStyles } = box.options;

	if (box.timing === 1) {
		return null;
	}

	const styles = { ...customStyles?.(box) };

	if (animation === AnimationKind.Custom) {
		if (typeof customStyles !== "function") {
			throw new Error(
				"customStyles must be a function when animation is set to custom",
			);
		}

		return styles;
	}

	if (animation === AnimationKind.BlurIn) {
		if (typeof blurAmount === "function") {
			blurAmount = blurAmount(box);
		}

		if (typeof blurAmount === "string") {
			blurAmount = box.text.convertToPx(blurAmount, box);
		}

		styles.filter ||= `blur(${((1 - box.timing) * blurAmount).toFixed(2)}px)`;
		styles.opacity ||= `${box.timing.toFixed(2)}`;

		return styles;
	}

	if (animation === AnimationKind.BounceIn) {
		// Ensure progress is between 0 and 1
		const clampedProgress = Math.max(0, Math.min(1, box.progress));

		// Define keyframe points
		const keyframes = [
			{ time: 0, value: 0 },
			{ time: 0.2, value: box.height * -0.2 },
			{ time: 0.4, value: 0 },
			{ time: 0.6, value: box.height * -0.1 },
			{ time: 0.8, value: 0 },
			{ time: 1, value: 0 },
		];

		// Find current keyframe segment
		let startFrame = keyframes[0]!;
		let endFrame = keyframes[1]!;
		for (let i = 1; i < keyframes.length; i++) {
			if (clampedProgress <= keyframes[i]!.time) {
				startFrame = keyframes[i - 1]!;
				endFrame = keyframes[i]!;
				break;
			}
		}

		// Calculate interpolation
		const segmentProgress =
			(clampedProgress - startFrame.time) / (endFrame.time - startFrame.time);
		const t = box.timingFunction(segmentProgress);
		const y = startFrame.value + (endFrame.value - startFrame.value) * t;

		styles.transform ||= `translateY(${y.toFixed(2)}px)`;

		return styles;
	}

	return null;
}
