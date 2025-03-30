import * as React from "react";

const RadioGroupContext = React.createContext({
  name: "",
  value: "",
  onValueChange: (value) => {},
});

const RadioGroup = React.forwardRef(({ className, value, onValueChange, name, ...props }, ref) => {
  return React.createElement(RadioGroupContext.Provider, {
    value: { name, value, onValueChange }
  }, React.createElement("div", {
    ref: ref,
    className: `grid gap-2 ${className || ""}`,
    ...props
  }));
});
RadioGroup.displayName = "RadioGroup";

const RadioGroupItem = React.forwardRef(({ className, value, id, ...props }, ref) => {
  const context = React.useContext(RadioGroupContext);
  
  return React.createElement("div", {
    className: "flex items-center space-x-2"
  }, React.createElement("input", {
    ref: ref,
    type: "radio",
    className: `h-4 w-4 text-primary border-gray-300 focus:ring-primary ${className || ""}`,
    id: id,
    value: value,
    checked: context.value === value,
    name: context.name,
    onChange: (e) => {
      if (e.target.checked && context.onValueChange) {
        context.onValueChange(value);
      }
    },
    ...props
  }));
});
RadioGroupItem.displayName = "RadioGroupItem";

export { RadioGroup, RadioGroupItem };
