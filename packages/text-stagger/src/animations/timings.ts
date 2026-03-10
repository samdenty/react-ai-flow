export enum AnimationTiming {
	Linear = "linear",
	Ease = "ease",
	EaseIn = "ease-in",
	EaseOut = "ease-out",
	EaseInOut = "ease-in-out",
}

const linearTiming = (progress: number): number => {
	return progress;
};

const easeTiming = (progress: number): number => {
	return progress < 0.5
		? 4 * progress * progress * progress
		: 1 - (-2 * progress + 2) ** 3 / 2;
};

const easeInTiming = (progress: number): number => {
	return progress * progress * progress;
};

const easeOutTiming = (progress: number): number => {
	return 1 - (1 - progress) ** 3;
};

const easeInOutTiming = (progress: number): number => {
	return progress < 0.5
		? 8 * progress * progress * progress * progress
		: 1 - (-2 * progress + 2) ** 4 / 2;
};

// Usage with timing enum:
export const timingFunctions = {
	[AnimationTiming.Linear]: linearTiming,
	[AnimationTiming.Ease]: easeTiming,
	[AnimationTiming.EaseIn]: easeInTiming,
	[AnimationTiming.EaseOut]: easeOutTiming,
	[AnimationTiming.EaseInOut]: easeInOutTiming,
};
