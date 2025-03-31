import { useEffect } from "react";
import { extractTextFromLines } from "../src/scanLines.js";

export function Demo() {
	useEffect(() => {
		console.log(extractTextFromLines(window.document.body, true));
	}, []);

	return (
		<>
			<div className="example">
				<h2>1. Paragraph Elements</h2>
				<p>This is paragraph one.</p>
				<p>This is paragraph two.</p>
				<p>This is paragraph three.</p>
				<div className="note">
					Paragraphs create vertical space between them.
				</div>
			</div>

			<div className="example">
				<h2>2. Line Break Tag</h2>
				This text has a line break
				<br />
				right here and continues.
				<br />
				Another line break above.
				<br />
				And one more here.
				<div className="note">
					The br tag forces a line break without extra spacing.
				</div>
			</div>

			<div className="example">
				<h2>3. Heading Elements</h2>
				<h1>Heading 1</h1>
				<h2>Heading 2</h2>
				<h3>Heading 3</h3>
				<h4>Heading 4</h4>
				<div className="note">
					Headings create line breaks with different spacings.
				</div>
			</div>

			<div className="example">
				<h2>4. Block Elements</h2>
				<div>This is a div element.</div>
				<div>This is another div element.</div>
				<div>And one more div element.</div>
				<div className="note">
					Block elements like div start on new lines by default.
				</div>
			</div>

			<div className="example">
				<h2>5. Lists</h2>
				<ul>
					<li>List item one</li>
					<li>List item two</li>
					<li>List item three</li>
				</ul>
				<ol>
					<li>Numbered item one</li>
					<li>Numbered item two</li>
					<li>Numbered item three</li>
				</ol>
				<div className="note">
					List items create line breaks, and lists themselves create block
					spacing.
				</div>
			</div>

			<div className="example">
				<h2>6. Table Rows</h2>
				<table border={1} cellPadding={5}>
					<tr>
						<td>Row 1, Cell 1</td>
						<td>Row 1, Cell 2</td>
					</tr>
					<tr>
						<td>Row 2, Cell 1</td>
						<td>Row 2, Cell 2</td>
					</tr>
					<tr>
						<td>Row 3, Cell 1</td>
						<td>Row 3, Cell 2</td>
					</tr>
				</table>
				<div className="note">Table rows create visual line breaks.</div>
			</div>

			<div className="example">
				<h2>7. Pre-formatted Text</h2>
				<pre>
					This text preserves all spacing and line breaks exactly as written.
				</pre>
				<div className="note">
					Pre tag preserves whitespace and line breaks.
				</div>
			</div>

			<div className="example">
				<h2>8. Horizontal Rule</h2>
				Text above the rule.
				<hr />
				Text below the rule.
				<div className="note">
					HR tags create visual separation with a line.
				</div>
			</div>

			<div className="example">
				<h2>9. CSS Display Property</h2>
				<span style={{ display: "block", marginBottom: "10px" }}>
					This span is displayed as a block.
				</span>
				<span style={{ display: "block", marginBottom: "10px" }}>
					This span is also displayed as a block.
				</span>
				<span style={{ display: "block", marginBottom: "10px" }}>
					And this span too.
				</span>
				<div className="note">
					Using CSS to change inline elements to block creates line breaks.
				</div>
			</div>

			<div className="example">
				<h2>10. CSS White-Space Property</h2>
				<div style={{ whiteSpace: "pre" }}>
					This text has preserved line breaks using white-space: pre.
				</div>
				<div className="note">
					CSS white-space property can preserve line breaks.
				</div>
			</div>

			<div className="example">
				<h2>11. Flex Direction Column</h2>
				<div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
					<span style={{ border: "1px solid blue", padding: "5px" }}>
						Flex item 1
					</span>
					<span style={{ border: "1px solid blue", padding: "5px" }}>
						Flex item 2
					</span>
					<span style={{ border: "1px solid blue", padding: "5px" }}>
						Flex item 3
					</span>
				</div>
				<div className="note">
					Flex items in column direction stack vertically.
				</div>
			</div>

			<div className="example">
				<h2>12. Form Elements</h2>
				<form>
					<label htmlFor="name">Name:</label>
					<br />
					<input type="text" id="name" />
					<br />
					<label htmlFor="email">Email:</label>
					<br />
					<input type="email" id="email" />
					<br />
					<label htmlFor="message">Message:</label>
					<br />
					<textarea id="message" />
				</form>
				<div className="note">
					Form elements with line breaks create vertical layouts.
				</div>
			</div>

			<div className="example">
				<h2>13. Block Quotes</h2>
				<blockquote>
					This is a blockquote element that creates its own block with spacing.
				</blockquote>
				<blockquote>
					This is another blockquote showing how they stack.
				</blockquote>
				<div className="note">Blockquotes create block-level spacing.</div>
			</div>
		</>
	);
}
