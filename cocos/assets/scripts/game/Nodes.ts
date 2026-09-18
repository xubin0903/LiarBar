import { Label, Node, Sprite, UITransform } from 'cc';

export function findDeep(root: Node | null, name: string): Node | null {
  if (!root) {
    return null;
  }
  if (root.name === name) {
    return root;
  }
  const kids = root.children;
  for (let i = 0; i < kids.length; i++) {
    const hit = findDeep(kids[i], name);
    if (hit) {
      return hit;
    }
  }
  return null;
}

export function labelOf(n: Node | null): Label | null {
  return n ? n.getComponent(Label) : null;
}

export function spriteOf(n: Node | null): Sprite | null {
  return n ? n.getComponent(Sprite) : null;
}

export function uiOf(n: Node | null): UITransform | null {
  return n ? n.getComponent(UITransform) : null;
}

export function ensureUi(n: Node, w: number, h: number): UITransform {
  let ui = n.getComponent(UITransform);
  if (!ui) {
    ui = n.addComponent(UITransform);
  }
  ui.setContentSize(w, h);
  ui.setAnchorPoint(0.5, 0.5);
  return ui;
}

export function destroyNamed(root: Node | null, name: string): void {
  if (!root) {
    return;
  }
  const hit = findDeep(root, name);
  if (hit && hit !== root) {
    hit.removeFromParent();
    hit.destroy();
  }
}
