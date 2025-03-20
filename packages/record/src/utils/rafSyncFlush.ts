export const originalRequestAnimationFrame = window.requestAnimationFrame;
const originalCancelAnimationFrame = window.cancelAnimationFrame;

const pendingCallbacks = new Map<number, FrameRequestCallback>();

window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
	const requestId: number = originalRequestAnimationFrame((time) => {
		pendingCallbacks.delete(requestId);
		callback(time);
	});

	pendingCallbacks.set(requestId, callback);
	return requestId;
};

window.cancelAnimationFrame = (requestId: number) => {
	pendingCallbacks.delete(requestId);
	originalCancelAnimationFrame(requestId);
};

export function rafSyncFlush(): void {
	const callbacks = [...pendingCallbacks.entries()];
	pendingCallbacks.clear();

	callbacks.forEach(([requestId, callback]) => {
		originalCancelAnimationFrame(requestId);

		try {
			callback(performance.now());
		} catch (e) {
			console.error("Error in animation frame callback:", e);
		}
	});
}
