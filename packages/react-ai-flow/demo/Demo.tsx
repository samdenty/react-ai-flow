import { useState } from "react";
import {
	StaggerProvider,
	StaggeredText,
	StickToBottom,
	enableIOSVibrationWithPopup,
	useStickToBottomContext,
} from "react-ai-flow";
import { useFakeMessages } from "./useFakeMessages.js";

enableIOSVibrationWithPopup();

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
				{/* <StickToBottom.Content className="flex flex-col gap-4 p-6"> */}
				{[...Array(1)].map((_, i) => (
					<Message key={i}>
						<h1 style={{ paddingLeft: 20 }}>
							{"foo"}{" "}
							<span>
								this1 is2 a3 very4 long5 test6 <span>athis7</span> is8 a9 very10
							</span>
							long11 test12
						</h1>
						more testing text...
					</Message>
				))}

				{messages.map((message, i) => (
					<Message key={i}>{message}</Message>
				))}
				{/* </StickToBottom.Content> */}
				{/* <ScrollToBottom /> */}
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

	return (
		<StaggerProvider streaming>
			<div className="prose flex flex-col gap-2 w-full overflow-hidden">
				{/* <StickToBottom className="h-[50vh] flex flex-col" initial={false}> */}
				<MessagesContent
					messages={paused || messages}
					paused={!!paused}
					onPausePlay={() => (paused ? setPaused(false) : setPaused(messages))}
				/>
				{/* </StickToBottom> */}
			</div>
		</StaggerProvider>
	);
}

function Message({ children }: { children: React.ReactNode }) {
	return (
		<div className="bg-gray-100 rounded-lg p-4 shadow-md break-words">
			<StaggeredText
				splitter="word"
				// visualDebug
				delayTrailing
				animation="blur-in"
				// animation="blur-in"
				// animation="bounce-in"
				duration={(element) => {
					return 200;
				}}
				stagger="100%"
				// animation="gradient-reveal"
				gradientWidth={(box) => {
					// return box.progress * box.width;
					return "100%";
				}}
			>
				{children}
			</StaggeredText>
		</div>
	);
}

export function Demo() {
	const [speed, setSpeed] = useState(0.05);

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
