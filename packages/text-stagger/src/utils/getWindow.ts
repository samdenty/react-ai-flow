export function getWindow(node: Node) {
	return (node.ownerDocument ?? (node as Document)).defaultView!;
}
