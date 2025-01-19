const styleSheet = new CSSStyleSheet();
document.adoptedStyleSheets = [...document.adoptedStyleSheets, styleSheet];

const streamRules = new Map<string, CSSStyleRule>();

export function updateProperty(
  className: string,
  property: string | null,
  value?: string | null
) {
  let rule = streamRules.get(className);

  if (!property) {
    if (rule) {
      streamRules.delete(className);
      const ruleIndex = [...styleSheet.cssRules].indexOf(rule);
      styleSheet.deleteRule(ruleIndex);
    }

    return;
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
