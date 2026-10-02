import type { AccessibleNode } from "./production-contract";

export function orderedFocus(nodes: AccessibleNode[]): AccessibleNode[] {
  return [...nodes].sort((a, b) => a.order - b.order);
}

export function hasNonColorStateCue(node: AccessibleNode): boolean {
  return Boolean(node.nonColorCue?.trim());
}

export function validateCriticalNodes(nodes: AccessibleNode[]): string[] {
  const errors: string[] = [];
  for (const node of nodes) {
    if ((node.role === "button" || node.role === "alert") && !node.label.trim()) {
      errors.push(`${node.id}: missing accessible label`);
    }
    if (node.minimumTargetDp !== undefined && node.minimumTargetDp < 48) {
      errors.push(`${node.id}: touch target below 48dp`);
    }
    if (node.role === "alert" && !hasNonColorStateCue(node)) {
      errors.push(`${node.id}: alert depends on color`);
    }
  }
  return errors;
}
