import { useCallback, useState } from "react";
import {
	StaggerProvider,
	StaggeredText,
	StickToBottom,
	type TextOptions,
	useStickToBottomContext,
} from "react-ai-flow";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "./components/ui/card.js";
import { Label } from "./components/ui/label.js";
import { RadioGroup, RadioGroupItem } from "./components/ui/radio-group.js";
import { Slider } from "./components/ui/slider.js";
import { useFakeMessages } from "./useFakeMessages.js";

// enableIOSVibrationWithPopup();

function ScrollToBottom() {
	const { isAtBottom, scrollToBottom } = useStickToBottomContext();

	return (
		!isAtBottom && (
			<button
				type="button"
				className="absolute i-ph-arrow-circle-down-fill text-4xl rounded-lg left-[50%] translate-x-[-50%] bottom-0"
				onClick={() => scrollToBottom()}
			/>
		)
	);
}

function MessagesContent({
	messages,
	onPausePlay,
	paused,
}: {
	messages: React.ReactNode[][];
	onPausePlay: VoidFunction;
	paused: boolean;
}) {
	return (
		<>
			<div className="relative w-full flex flex-col overflow-hidden">
				<StickToBottom.Content className="flex flex-col gap-4 p-6">
					{[...Array(1)].map((_, i) => (
						<Message key={i}>
							<h1 style={{ paddingLeft: 20 }}>
								{"foo"}{" "}
								<span>
									this1 is2 a3 very4 long5 test6 <span>athis7</span> is8 a9
									very10
								</span>
								long11 test12
							</h1>
							more testing text...
						</Message>
					))}

					{messages.map((message, i) => (
						<Message key={i}>{message}</Message>
					))}
				</StickToBottom.Content>
				<ScrollToBottom />
			</div>

			<div className="flex justify-center pt-4">
				<button
					type="button"
					className="rounded bg-slate-600 text-white px-4 py-2"
					onClick={() => onPausePlay()}
				>
					{paused ? "Play" : "Pause"}
				</button>
			</div>
		</>
	);
}

type Options = {
	[K in
		| "stagger"
		| "animation"
		| "blurAmount"
		| "splitter"
		| "duration"
		| "visualDebug"
		| "gradientWidth"
		| "animationTiming"
		| "delayTrailing"]: Extract<TextOptions[K], string | boolean | number>;
};

function Messages({
	speed,
	setSpeed,
}: { speed: number; setSpeed: (speed: number) => void }) {
	const messages = useFakeMessages(speed);
	const [paused, setPaused] = useState<React.ReactNode[][] | false>(false);

	const [options, setOptions] = useState<Options>({
		stagger: "5%",
		animation: "blur-in",
		blurAmount: "5px",
		splitter: "character",
		duration: 1000,
		visualDebug: false,
		gradientWidth: "30%",
		animationTiming: "ease",
		delayTrailing: true,
	});

	const updateOptions = useCallback(
		(options: Partial<Options>) => {
			messages.length = 0;
			setOptions((prev) => ({ ...prev, ...options }));
		},
		[messages],
	);

	const isGradientAnimation =
		options.animation?.startsWith("gradient") ?? false;

	return (
		<StaggerProvider
			{...options}
			streaming
			delayTrailing
			gradientWidth={String(options.gradientWidth)}
		>
			<div className="grid grid-cols-2 gap-4 w-full">
				<Card>
					<CardHeader className="py-2">
						<CardTitle className="text-base">Animation Settings</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3 py-2">
						<div className="space-y-1">
							<Label>Presets</Label>
							<div className="grid grid-cols-2 gap-1">
								<button
									type="button"
									className="text-xs px-2 py-1 rounded bg-secondary hover:bg-secondary/80 transition-colors text-left"
									onClick={() => {
										updateOptions({
											splitter: "character",
											animation: "blur-in",
											blurAmount: "12px",
											stagger: "5%",
											duration: 1000,
										});
										setSpeed(0.15);
									}}
								>
									Character Blur
								</button>
								<button
									type="button"
									className="text-xs px-2 py-1 rounded bg-secondary hover:bg-secondary/80 transition-colors text-left"
									onClick={() => {
										updateOptions({
											splitter: "word",
											animation: "bounce-in",
											stagger: "16%",
											duration: 500,
										});
										setSpeed(0.15);
									}}
								>
									Word Bounce
								</button>
								<button
									type="button"
									className="text-xs px-2 py-1 rounded bg-secondary hover:bg-secondary/80 transition-colors text-left"
									onClick={() => {
										updateOptions({
											splitter: "line",
											animation: "gradient-down",
											duration: 500,
											stagger: "20%",
										});
										setSpeed(0.15);
									}}
								>
									Line Gradient Down
								</button>
								<button
									type="button"
									className="text-xs px-2 py-1 rounded bg-secondary hover:bg-secondary/80 transition-colors text-left"
									onClick={() => {
										updateOptions({
											splitter: "line",
											animation: "blur-in",
											blurAmount: "8px",
											stagger: "16%",
											duration: 500,
										});
										setSpeed(0.15);
									}}
								>
									Line Blur
								</button>
								<button
									type="button"
									className="text-xs px-2 py-1 rounded bg-secondary hover:bg-secondary/80 transition-colors text-left"
									onClick={() => {
										updateOptions({
											splitter: "line",
											animation: "gradient-reveal",
											gradientWidth: "70%",
											stagger: "40%",
											duration: 550,
										});
										setSpeed(0.15);
									}}
								>
									Line Gradient Right
								</button>
								<button
									type="button"
									className="text-xs px-2 py-1 rounded bg-secondary hover:bg-secondary/80 transition-colors text-left"
									onClick={() => {
										updateOptions({
											splitter: "character",
											animation: "blur-in",
											blurAmount: "18px",
											stagger: "10%",
											duration: 300,
										});
										setSpeed(0.15);
									}}
								>
									Character Blur Fast
								</button>
							</div>
						</div>

						<div className="space-y-1">
							<Label>Splitter</Label>
							<RadioGroup
								defaultValue={options.splitter}
								onValueChange={(value) =>
									updateOptions({ splitter: value as any })
								}
								className="grid grid-cols-3 gap-1"
							>
								<div className="flex items-center space-x-1">
									<RadioGroupItem value="character" id="character" />
									<Label htmlFor="character" className="text-xs">
										Character
									</Label>
								</div>
								<div className="flex items-center space-x-1">
									<RadioGroupItem value="word" id="word" />
									<Label htmlFor="word" className="text-xs">
										Word
									</Label>
								</div>
								<div className="flex items-center space-x-1">
									<RadioGroupItem value="line" id="line" />
									<Label htmlFor="line" className="text-xs">
										Line
									</Label>
								</div>
								<div className="flex items-center space-x-1">
									<RadioGroupItem value="sentence" id="sentence" />
									<Label htmlFor="sentence" className="text-xs">
										Sentence
									</Label>
								</div>
								<div className="flex items-center space-x-1">
									<RadioGroupItem value="paragraph" id="paragraph" />
									<Label htmlFor="paragraph" className="text-xs">
										Paragraph
									</Label>
								</div>
							</RadioGroup>
						</div>

						<div className="space-y-1">
							<Label>Animation</Label>
							<RadioGroup
								defaultValue={options.animation}
								onValueChange={(value) => {
									if (value === "gradient") {
										updateOptions({ animation: "gradient-reveal" });
									} else {
										updateOptions({ animation: value as any });
									}
								}}
								className="grid grid-cols-3 gap-1"
							>
								<div className="flex items-center space-x-1">
									<RadioGroupItem value="blur-in" id="blur-in" />
									<Label htmlFor="blur-in" className="text-xs">
										Blur In
									</Label>
								</div>
								<div className="flex items-center space-x-1">
									<RadioGroupItem value="gradient" id="gradient" />
									<Label htmlFor="gradient" className="text-xs">
										Gradient
									</Label>
								</div>
								<div className="flex items-center space-x-1">
									<RadioGroupItem value="bounce-in" id="bounce-in" />
									<Label htmlFor="bounce-in" className="text-xs">
										Bounce In
									</Label>
								</div>
							</RadioGroup>

							{options.animation === "blur-in" && (
								<div className="space-y-1 pl-2">
									<Label className="text-xs">Blur Amount</Label>
									<div className="flex items-center space-x-2">
										<Slider
											value={[Number.parseInt(String(options.blurAmount), 10)]}
											onValueChange={([value]) => {
												if (typeof value === "number") {
													updateOptions({ blurAmount: `${value}px` });
												}
											}}
											min={1}
											max={30}
											step={1}
											className="flex-1"
										/>
										<span className="text-xs text-muted-foreground w-8 text-right">
											{options.blurAmount}
										</span>
									</div>
								</div>
							)}

							{isGradientAnimation && (
								<div className="space-y-1 pl-2">
									<Label className="text-xs">Gradient Direction</Label>
									<RadioGroup
										value={options.animation}
										onValueChange={(value) =>
											updateOptions({ animation: value as any })
										}
										className="grid grid-cols-4 gap-1"
									>
										<div className="flex items-center space-x-1">
											<RadioGroupItem
												value="gradient-reveal"
												id="gradient-right"
											/>
											<Label htmlFor="gradient-right" className="text-xs">
												Right
											</Label>
										</div>
										<div className="flex items-center space-x-1">
											<RadioGroupItem
												value="gradient-left"
												id="gradient-left"
											/>
											<Label htmlFor="gradient-left" className="text-xs">
												Left
											</Label>
										</div>
										<div className="flex items-center space-x-1">
											<RadioGroupItem value="gradient-up" id="gradient-up" />
											<Label htmlFor="gradient-up" className="text-xs">
												Up
											</Label>
										</div>
										<div className="flex items-center space-x-1">
											<RadioGroupItem
												value="gradient-down"
												id="gradient-down"
											/>
											<Label htmlFor="gradient-down" className="text-xs">
												Down
											</Label>
										</div>
									</RadioGroup>

									<div className="space-y-1">
										<Label className="text-xs">Gradient Width</Label>
										<div className="flex items-center space-x-2">
											<Slider
												value={[
													Number.parseInt(String(options.gradientWidth), 10),
												]}
												onValueChange={([value]) => {
													if (value !== undefined) {
														updateOptions({ gradientWidth: `${value}%` });
													}
												}}
												min={10}
												max={100}
												step={5}
												className="flex-1"
											/>
											<span className="text-xs text-muted-foreground w-8 text-right">
												{options.gradientWidth}
											</span>
										</div>
									</div>
								</div>
							)}
						</div>

						<div className="space-y-1">
							<Label className="text-xs">Stagger</Label>
							<div className="flex items-center space-x-2">
								<Slider
									value={[
										Number.parseInt(String(options.stagger ?? "100"), 10),
									]}
									onValueChange={([value]) => {
										if (typeof value === "number") {
											updateOptions({ stagger: `${value}%` });
										}
									}}
									min={0}
									max={50}
									step={0.1}
									className="flex-1"
								/>
								<span className="text-xs text-muted-foreground w-8 text-right">
									{options.stagger ?? "100%"}
								</span>
							</div>
						</div>

						<div className="space-y-1">
							<Label className="text-xs">Duration (ms)</Label>
							<div className="flex items-center space-x-2">
								<Slider
									value={[options.duration ?? 1000]}
									onValueChange={([value]) => {
										if (typeof value === "number") {
											updateOptions({ duration: value });
										}
									}}
									min={50}
									max={1000}
									step={10}
									className="flex-1"
								/>
								<span className="text-xs text-muted-foreground w-8 text-right">
									{options.duration ?? 1000}
								</span>
							</div>
						</div>
					</CardContent>
				</Card>

				<div className="prose flex flex-col gap-2 w-full overflow-hidden">
					<StickToBottom className="h-[60vh] flex flex-col">
						<MessagesContent
							messages={paused || messages}
							paused={!!paused}
							onPausePlay={() =>
								paused ? setPaused(false) : setPaused(messages)
							}
						/>
					</StickToBottom>
				</div>
			</div>
		</StaggerProvider>
	);
}

function Message({ children }: { children: React.ReactNode }) {
	return (
		<div className="bg-gray-100 rounded-lg p-4 shadow-md break-words">
			<StaggeredText>{children}</StaggeredText>
		</div>
	);
}

export function Demo() {
	const [speed, setSpeed] = useState(0.2);

	return (
		<div className="flex flex-col gap-4 p-4 items-center w-full max-w-4xl mx-auto">
			<Card className="w-full">
				<CardHeader className="py-2">
					<CardTitle className="text-base">Speed Control</CardTitle>
				</CardHeader>
				<CardContent className="py-2">
					<div className="flex items-center space-x-4">
						<Slider
							value={[speed]}
							onValueChange={([value]) => {
								if (typeof value === "number") {
									setSpeed(value);
								}
							}}
							min={0}
							max={1}
							step={0.01}
							className="flex-1"
						/>
						<span className="text-sm text-muted-foreground w-12 text-right">
							{(speed * 100).toFixed(0)}%
						</span>
					</div>
				</CardContent>
			</Card>

			<Messages speed={speed} setSpeed={setSpeed} />
		</div>
	);
}
