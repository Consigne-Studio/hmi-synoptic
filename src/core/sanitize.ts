/**
 * Nettoyage d'un SVG avant affichage. Un synoptique vient souvent d'un fichier exporté
 * (Inkscape, Figma, Illustrator, draw.io) ou d'un serveur : on le traite comme non fiable.
 * Liste blanche des références, liste noire des éléments actifs.
 */

const FORBIDDEN = new Set([
  'script', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video', 'canvas',
  'animate', 'animatemotion', 'animatetransform', 'set', 'discard', 'handler', 'listener', 'meta', 'link', 'base',
]);

const SAFE_DATA_URL = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;

export interface SanitizeReport {
  removedElements: number;
  removedAttributes: number;
}

function safeRef(value: string): boolean {
  const v = value.trim();
  return v.startsWith('#') || SAFE_DATA_URL.test(v);
}

/** Retire les url(...) qui ne pointent pas vers un fragment interne. */
function cleanCss(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (m, _q: string, target: string) => (target.trim().startsWith('#') ? m : 'none'))
    .replace(/expression\s*\(/gi, '(');
}

/** Nettoie l'arbre en place. */
export function sanitizeTree(root: Element): SanitizeReport {
  const report: SanitizeReport = { removedElements: 0, removedAttributes: 0 };
  const walk = (el: Element): void => {
    for (const child of Array.from(el.children)) {
      if (FORBIDDEN.has(child.localName.toLowerCase())) {
        child.remove();
        report.removedElements++;
      } else walk(child);
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const local = name.includes(':') ? name.slice(name.indexOf(':') + 1) : name;
      let drop = name.startsWith('on');
      if (!drop && (local === 'href' || name === 'src' || name === 'action' || name === 'formaction')) drop = !safeRef(attr.value);
      if (!drop && name === 'style') {
        const cleaned = cleanCss(attr.value);
        if (cleaned !== attr.value) el.setAttribute('style', cleaned);
      }
      if (!drop && /url\(/i.test(attr.value) && name !== 'style') drop = !/^\s*url\(\s*['"]?#/.test(attr.value);
      if (drop) {
        el.removeAttributeNode(attr);
        report.removedAttributes++;
      }
    }
    if (el.localName.toLowerCase() === 'style' && el.textContent) el.textContent = cleanCss(el.textContent);
  };
  walk(root);
  return report;
}

/** Analyse une chaîne SVG et renvoie l'élément racine nettoyé, ou lève une erreur lisible. */
export function parseSvg(source: string): { svg: SVGSVGElement; report: SanitizeReport } {
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  let root: Element | null = doc.documentElement;
  if (!root || root.localName !== 'svg' || doc.getElementsByTagName('parsererror').length > 0) {
    // Repli tolérant : le parseur HTML accepte les SVG légèrement invalides (commentaires, entités, export bricolé).
    root = new DOMParser().parseFromString(source, 'text/html').querySelector('svg');
    if (!root) throw new Error('le fichier fourni n’est pas un SVG valide.');
  }
  const report = sanitizeTree(root);
  return { svg: root as unknown as SVGSVGElement, report };
}
