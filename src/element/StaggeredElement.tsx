export interface StaggeredElementProps {
  children: React.ReactNode;
}

export function StaggeredElement({ children }: StaggeredElementProps) {
  return <div>{children}</div>;
}
