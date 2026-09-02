export interface ElProps {
  class?: string
  text?: string
  html?: string
  onClick?: (ev: MouseEvent) => void
  attrs?: Record<string, string>
  title?: string
}

/**
 * Tiny imperative element builder for the few non-React surfaces left: the Univer viewer host
 * (a third-party imperative widget) and the toast singleton.
 */
export function el(
  tag: string,
  props: ElProps = {},
  children: Array<Node | string> = []
): HTMLElement {
  const node = document.createElement(tag)
  if (props.class !== undefined) {
    node.className = props.class
  }
  if (props.text !== undefined) {
    node.textContent = props.text
  }
  if (props.html !== undefined) {
    node.innerHTML = props.html
  }
  if (props.title !== undefined) {
    node.title = props.title
  }
  if (props.onClick) {
    node.addEventListener('click', props.onClick)
  }
  if (props.attrs) {
    for (const [k, v] of Object.entries(props.attrs)) {
      node.setAttribute(k, v)
    }
  }
  for (const c of children) {
    node.append(c)
  }
  return node
}
