import * as React from "react";

const Label = React.forwardRef(({ className, ...props }, ref) => 
  React.createElement("label", {
    ref,
    className: `text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className || ""}`,
    ...props
  })
);
Label.displayName = "Label";

export { Label };
