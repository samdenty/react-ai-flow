import * as React from "react";

const RadioGroup = React.forwardRef(({ className, ...props }, ref) => {
  return React.createElement("div", {
    ref: ref,
    className: `grid gap-2 ${className || ""}`,
    ...props
  });
});
RadioGroup.displayName = "RadioGroup";

const RadioGroupItem = React.forwardRef(({ className, ...props }, ref) => {
  return React.createElement("div", {
    className: "flex items-center space-x-2"
  }, React.createElement("input", {
    ref: ref,
    type: "radio",
    className: `h-4 w-4 text-primary border-gray-300 focus:ring-primary ${className || ""}`,
    ...props
  }));
});
RadioGroupItem.displayName = "RadioGroupItem";

export { RadioGroup, RadioGroupItem };
