const styleSheets = new Map<
	Window & typeof globalThis,
	{ styleSheet: CSSStyleSheet; rules: Map<string, CSSStyleRule> }
>();

export function updateStyles(
	window: Window & typeof globalThis,
	className: string,
	property: string | null,
	value?: string | null,
) {
	let { styleSheet, rules } = styleSheets.get(window) || {};

	if (!styleSheet || !rules) {
		styleSheet = new window.CSSStyleSheet();
		rules = new Map();
		styleSheets.set(window, { styleSheet, rules });

		window.document.adoptedStyleSheets = [
			...window.document.adoptedStyleSheets,
			styleSheet,
		];
	}

	let rule = rules.get(className);

	if (!property) {
		for (const styleSheet of window.document.adoptedStyleSheets) {
			for (let i = 0; i < styleSheet.cssRules.length; i++) {
				const rule = styleSheet.cssRules[i];

				if (
					rule instanceof window.CSSStyleRule &&
					rule.selectorText === `.${className}`
				) {
					styleSheet.deleteRule(i);
				}
			}
		}

		return;
	}

	// If we don't have a rule yet or need to recreate it
	if (!rule) {
		const ruleIndex = styleSheet.insertRule(`.${className} {}`);
		rule = styleSheet.cssRules[ruleIndex] as CSSStyleRule;
		rules.set(className, rule);
	}

	if (value) {
		rule.style.setProperty(property, value);
	} else {
		rule.style.removeProperty(property);
	}
}
