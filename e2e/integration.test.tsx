import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import React from "react";
import type { RecordedEvent } from "text-stagger-record";
import { Runner, type RunnerFrame } from "./Runner";
import { getFrames } from "text-stagger-replay/dist/frames.js";

const __dirname = path.resolve(fileURLToPath(import.meta.url), "..");
const testsPath = path.resolve(__dirname, "./tests");
const testPaths = getFiles(testsPath).filter((path) => path.endsWith(".json"));

interface Context {
	name: string;
	testPath: string;
	screenshotsPath: string;
	originalPath: string;
	hydratedPath: string;
	diffsPath: string;
}

async function testFrame(
	{ originalPath, hydratedPath, diffsPath, name }: Context,
	frame: RunnerFrame,
	page: Page,
) {
	const iframes = await page.locator("iframe").all();

	const screenshots = await Promise.all(
		iframes.map(async (iframe) => {
			// Get the iframe's content frame
			return iframe.screenshot();
		}),
	);

	if (!fs.existsSync(originalPath)) {
		fs.mkdirSync(originalPath, { recursive: true });
	}
	if (!fs.existsSync(hydratedPath)) {
		fs.mkdirSync(hydratedPath, { recursive: true });
	}
	if (!fs.existsSync(diffsPath)) {
		fs.mkdirSync(diffsPath, { recursive: true });
	}

	screenshots.forEach((screenshot, i) => {
		fs.writeFileSync(
			path.join(i === 0 ? originalPath : hydratedPath, `${frame.index}.png`),
			screenshot,
		);
	});

	const pngs = screenshots.map((screenshot) => {
		return PNG.sync.read(screenshot);
	});

	const png1 = pngs.shift()!;
	const diffPng = new PNG({ width: png1.width, height: png1.height });

	for (const png of pngs) {
		const mismatch = pixelmatch(
			png1.data as any,
			png.data as any,
			diffPng.data as any,
			png.width,
			png.height,
			{ threshold: 0.6 },
		);

		const diffBuffer = PNG.sync.write(diffPng);

		fs.writeFileSync(path.join(diffsPath, `${frame.index}.png`), diffBuffer);

		if (mismatch > 70) {
			console.log(
				frame.index,
				mismatch,
				frame.recordedEvents.at(-1)?.timestamp,
			);

			expect(mismatch).toBeLessThan(70);
		}
	}

	await page.evaluate(() => {
		(window as any).next();
	});
}

function getFiles(dir: string): string[] {
	const children = fs.readdirSync(dir);
	return children.flatMap((subdir) => {
		const res = path.resolve(dir, subdir);
		return fs.statSync(res).isDirectory() ? getFiles(res) : res;
	});
}

for (const testPath of testPaths) {
	const name = path.relative(testsPath, testPath);
	const events: RecordedEvent[] = JSON.parse(
		fs.readFileSync(testPath, "utf-8"),
	);

	const firstEvent = events[0];

	if (firstEvent?.type !== 4) {
		throw new Error("First event is not a meta event");
	}

	const visualDebug = events.some((event) =>
		[...event.snapshots].some((snapshot) => snapshot.options),
	);

	const { width, height } = firstEvent.data;

	const frames = getFrames(events);

	const batchSize = 10;
	const batchCount = Math.ceil(frames.length / batchSize);
	const testScreenshotPath = path.join(
		testPath,
		"../__screenshots__",
		path.basename(testPath),
	);

	test.describe(name, async () => {
		for (let batch = 0; batch < batchCount; batch++) {
			const startFrame = batch * batchSize;
			const endFrame = Math.min(startFrame + batchSize, frames.length);

			test(`frames ${startFrame}-${endFrame}`, async ({
				page,
				mount,
				browserName,
			}) => {
				// Visual debug has different box sizes across browsers
				if (visualDebug && browserName !== "chromium") {
					test.skip();
				}

				const screenshotsPath = path.join(testScreenshotPath, browserName);

				const diffsPath = path.join(screenshotsPath, "diffs");
				const originalPath = path.join(screenshotsPath, "original");
				const hydratedPath = path.join(screenshotsPath, "hydrated");

				await page.setViewportSize({ width, height: height * 2 });

				let complete!: VoidFunction;

				await mount(
					<Runner
						events={events}
						startFrame={startFrame}
						endFrame={endFrame}
						onFrame={(frame) => {
							testFrame(
								{
									diffsPath,
									hydratedPath,
									name,
									originalPath,
									screenshotsPath,
									testPath,
								},
								frame,
								page,
							);
						}}
						onComplete={() => complete()}
					/>,
				);

				await new Promise<void>((resolve) => {
					complete = resolve;
				});
			});
		}
	});
}
