let styleSheet: CSSStyleSheet;

const streamRules = new Map<string, CSSStyleRule>();

export function updateProperty(
	className: string,
	property: string,
	value: string | null,
) {
	let rule = streamRules.get(className);

	if (!styleSheet) {
		styleSheet = new CSSStyleSheet();
		document.adoptedStyleSheets = [...document.adoptedStyleSheets, styleSheet];
	}

	// If we don't have a rule yet or need to recreate it
	if (!rule) {
		const ruleIndex = styleSheet.insertRule(`.${className} {}`);
		rule = styleSheet.cssRules[ruleIndex] as CSSStyleRule;
		streamRules.set(className, rule);
	}

	if (value) {
		rule.style.setProperty(property, value);
	} else {
		rule.style.removeProperty(property);
	}
}
