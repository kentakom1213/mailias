export function mustGetRoot(): HTMLElement {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("#app not found");
  return root;
}

export function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(text: string, className = "button"): HTMLButtonElement {
  const node = el("button", className, text);
  node.type = "button";
  return node;
}

export function message(root: HTMLElement, text: string, kind: "error" | "notice" = "notice"): void {
  const node = el("div", `message ${kind}`, text);
  append(root, node);
}

// Use DOM appendChild because the Worker declarations also define Element.append.
export function append(parent: Node, ...children: Node[]): void {
  for (const child of children) parent.appendChild(child);
}
