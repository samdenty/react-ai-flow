import { useEffect, useRef, useState } from "react";
import {
	type ElementAnimation,
	type ElementStagger,
	StaggerProvider,
	StaggeredText,
	StickToBottom,
	type StickToBottomContext,
	type TextSplitter,
	enableIOSVibrationWithPopup,
	useStickToBottomContext,
} from "react-ai-flow";
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

function Messages({ speed }: { speed: number }) {
	const messages = useFakeMessages(speed);

	const [paused, setPaused] = useState<React.ReactNode[][] | false>(false);
	const [splitter, setSplitter] =
		useState<Extract<TextSplitter, string>>("line");
	const [animation, setAnimation] = useState<`${ElementAnimation}`>("blur-in");
	const [stagger, setStagger] =
		useState<Extract<ElementStagger, string>>("80%");
	const stickToBottomRef = useRef<StickToBottomContext>(null);

	return (
		<StaggerProvider
			streaming
			splitter={splitter}
			animation={animation}
			stagger={stagger}
		>
			<div className="flex gap-2 mb-2">
				<label>
					Splitter:
					<select
						id="splitter"
						defaultValue={splitter}
						onChange={(e) => {
							setSplitter(e.target.value as any);
							stickToBottomRef.current?.scrollRef.current?.scrollTo(0, 0);
						}}
					>
						<option value="character">Character</option>
						<option value="word">Word</option>
						<option value="line">Line</option>
					</select>
				</label>
				<label>
					Animation:
					<select
						id="animation"
						defaultValue={animation}
						onChange={(e) => {
							setAnimation(e.target.value as any);
							stickToBottomRef.current?.scrollRef.current?.scrollTo(0, 0);
						}}
					>
						<option value="blur-in">Blur In</option>
						<option value="gradient-reveal">Gradient Reveal</option>
						<option value="bounce-in">Bounce In</option>
					</select>
				</label>
				<label>
					Stagger:
					<select
						id="stagger"
						defaultValue={stagger}
						onChange={(e) => {
							setStagger(e.target.value as any);
							stickToBottomRef.current?.scrollRef.current?.scrollTo(0, 0);
						}}
					>
						<option value="100%">100%</option>
						<option value="80%">80%</option>
						<option value="50%">50%</option>
						<option value="25%">25%</option>
						<option value="10%">10%</option>
						<option value="5%">5%</option>
						<option value="2%">2%</option>
					</select>
				</label>
			</div>
			<div className="prose flex flex-col gap-2 w-full overflow-hidden">
				<StickToBottom className="h-[50vh] flex flex-col">
					<MessagesContent
						messages={paused || messages}
						paused={!!paused}
						onPausePlay={() =>
							paused ? setPaused(false) : setPaused(messages)
						}
					/>
				</StickToBottom>
			</div>
		</StaggerProvider>
	);
}

function Message({ children }: { children: React.ReactNode }) {
	return (
		<div className="bg-gray-100 rounded-lg p-4 shadow-md break-words">
			<StaggeredText
				delayTrailing
				duration={(element) => {
					return 1000;
				}}
				gradientWidth={(box) => {
					return "30%";
				}}
			>
				{children}
			</StaggeredText>
		</div>
	);
}

export function Demo() {
	const [speed, setSpeed] = useState(0.2);

	return (
		<div className="flex flex-col gap-10 p-10 items-center w-full">
			<input
				className="w-full max-w-screen-lg"
				type="range"
				value={speed}
				onChange={(e) => setSpeed(+e.target.value)}
				min={0}
				max={1}
				step={0.01}
			/>

			<div className="flex gap-6 w-full max-w-screen-lg">
				<Messages speed={speed} />
			</div>
		</div>
	);
}
