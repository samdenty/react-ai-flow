import type { CustomStyles } from "../stagger/index.js";
import type { StaggerElementBox } from "../stagger/StaggerElementBox.js";

export function bounceIn(box: StaggerElementBox) {
	const styles: CustomStyles = {};

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
