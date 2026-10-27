import type { Value } from './parse.js';

/** Types de liaison reconnus dans un SVG. */
export const KINDS = ['level', 'spin', 'angle', 'move', 'flow', 'text', 'state', 'visible', 'alarm', 'fill', 'stroke', 'blink', 'select'] as const;
export type Kind = (typeof KINDS)[number];

export type Quality = 'good' | 'uncertain' | 'bad' | 'stale';

/** Métadonnées d'une variable, partagées par toutes ses liaisons. Les attributs data-hmi-* de l'élément priment. */
export interface TagConfig {
  label?: string;
  min?: number;
  max?: number;
  unit?: string;
  decimals?: number;
  ll?: number;
  l?: number;
  h?: number;
  hh?: number;
  /** Table de correspondance, ex. `0:stopped,1:running,2:fault` ou objet { 0: 'stopped', 1: 'running' }. */
  map?: string | Record<string, string>;
}

export type TagConfigMap = Record<string, TagConfig>;

export interface TagState {
  value: Value | undefined;
  quality: Quality;
  updated: number;
}

export interface BindingInfo {
  tag: string;
  kind: Kind;
  /** id de l'élément SVG, ou chaîne vide. */
  id: string;
}

const KIND_SET = new Set<string>(KINDS);

/**
 * Convention d'identifiant pour les SVG dessinés dans Inkscape, Figma ou Illustrator,
 * où ajouter des attributs est pénible mais nommer un calque est immédiat :
 *   id="LT101--level"   id="P101--spin"   id="FT101--flow_2" (suffixe de doublon toléré)
 */
export function parseIdConvention(id: string | null | undefined): { tag: string; kind: Kind } | undefined {
  if (!id) return undefined;
  const parts = id.split('--');
  if (parts.length < 2) return undefined;
  const tag = parts[0].trim();
  const kind = parts[1].trim().toLowerCase().replace(/[_-]\d+$/, '');
  if (!tag || !KIND_SET.has(kind)) return undefined;
  return { tag, kind: kind as Kind };
}

/** Trouve toutes les liaisons déclarées sous `root`, par attributs data-hmi-<type> ou par convention d'id. */
export function collectBindings(root: Element): { el: SVGElement; tag: string; kind: Kind }[] {
  const found: { el: SVGElement; tag: string; kind: Kind }[] = [];
  const all = [root, ...Array.from(root.querySelectorAll('*'))];
  for (const el of all) {
    const seen = new Set<string>();
    for (const kind of KINDS) {
      const tag = el.getAttribute(`data-hmi-${kind}`);
      if (tag && tag.trim()) {
        found.push({ el: el as SVGElement, tag: tag.trim(), kind });
        seen.add(kind);
      }
    }
    for (const name of [el.getAttribute('id'), el.getAttribute('inkscape:label'), el.getAttribute('data-name')]) {
      const conv = parseIdConvention(name);
      if (conv && !seen.has(conv.kind)) {
        found.push({ el: el as SVGElement, ...conv });
        seen.add(conv.kind);
      }
    }
  }
  return found;
}
