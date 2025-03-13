import { LoremIpsum } from "lorem-ipsum";
import { useCallback, useEffect, useState } from "react";

const lorem = new LoremIpsum();

let id = 0;

export function useFakeMessages(speed = 1) {
	const [messages, setMessages] = useState<React.ReactNode[][]>([]);

	const getRandomInt = useCallback((min: number, max: number) => {
		min = Math.ceil(min);
		max = Math.floor(max);
		return Math.floor(Math.random() * (max - min + 1)) + min;
	}, []);

	const getInterval = useCallback(() => {
		const a = getRandomInt(2 * (1 - speed), 700 * (1 - speed));

		return a;
	}, [speed, getRandomInt]);
	const getWordCount = useCallback(() => getRandomInt(10, 150), [getRandomInt]);
	const getWords = useCallback(() => Math.round(50 * speed), [speed]);

	useEffect(() => {
		let wordCount = 0;
		let timer: NodeJS.Timeout;

		const update = () => {
			if (wordCount <= 0) {
				wordCount = getWordCount();
				setMessages((prevMessages) => [...prevMessages, []]);
			}

			const Tag = Math.random() < 0.1 ? "h1" : null;

			let words = getWords();
			if (words > wordCount) {
				words = wordCount;
			}

			setMessages((prevMessages) => {
				const newMessages = [...prevMessages];
				const text = lorem
					.generateWords(words)
					.split(" ")
					.map((a) => `${a}${++id}`)
					.join(" ");
				const lastMessage = newMessages.pop()!;

				newMessages.push([
					...lastMessage,
					Tag ? <Tag key={lastMessage.length}>{text}</Tag> : text,
				]);

				return newMessages;
			});

			wordCount -= words;

			timer = setTimeout(update, getInterval());
		};

		timer = setTimeout(update, getInterval());

		return () => clearTimeout(timer);
	}, [getInterval, getWordCount, getWords]);

	return messages;
}
