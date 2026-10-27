/** Boîte englobante tolérante : getBBox en navigateur, attributs sinon (tests, SSR, élément masqué). */
export interface Box { x: number; y: number; width: number; height: number }

const num = (el: Element, name: string): number => Number(el.getAttribute(name)) || 0;

/** Lit « x y w h » ou « x y ». */
export function parseNumbers(raw: string | null | undefined): number[] {
  if (!raw) return [];
  return raw.trim().split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
}

export function bbox(el: Element): Box {
  const explicit = parseNumbers(el.getAttribute('data-hmi-box'));
  if (explicit.length === 4) return { x: explicit[0], y: explicit[1], width: explicit[2], height: explicit[3] };
  const g = el as SVGGraphicsElement;
  if (typeof g.getBBox === 'function') {
    try {
      const b = g.getBBox();
      if (b.width > 0 || b.height > 0) return { x: b.x, y: b.y, width: b.width, height: b.height };
    } catch {
      /* élément non rendu : on passe aux attributs */
    }
  }
  switch (el.localName) {
    case 'rect':
    case 'image':
    case 'use':
      return { x: num(el, 'x'), y: num(el, 'y'), width: num(el, 'width'), height: num(el, 'height') };
    case 'circle': {
      const r = num(el, 'r');
      return { x: num(el, 'cx') - r, y: num(el, 'cy') - r, width: 2 * r, height: 2 * r };
    }
    case 'ellipse': {
      const rx = num(el, 'rx');
      const ry = num(el, 'ry');
      return { x: num(el, 'cx') - rx, y: num(el, 'cy') - ry, width: 2 * rx, height: 2 * ry };
    }
    default: {
      // Groupe : union des enfants connus.
      const boxes = Array.from(el.children).map(bbox).filter((b) => b.width > 0 || b.height > 0);
      if (boxes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
      const x = Math.min(...boxes.map((b) => b.x));
      const y = Math.min(...boxes.map((b) => b.y));
      const r = Math.max(...boxes.map((b) => b.x + b.width));
      const bt = Math.max(...boxes.map((b) => b.y + b.height));
      return { x, y, width: r - x, height: bt - y };
    }
  }
}
