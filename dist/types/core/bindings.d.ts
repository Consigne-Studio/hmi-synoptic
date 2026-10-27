import type { Value } from './parse.js';
/** Types de liaison reconnus dans un SVG. */
export declare const KINDS: readonly ["level", "spin", "angle", "move", "flow", "text", "state", "visible", "alarm", "fill", "stroke", "blink", "select"];
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
/**
 * Convention d'identifiant pour les SVG dessinés dans Inkscape, Figma ou Illustrator,
 * où ajouter des attributs est pénible mais nommer un calque est immédiat :
 *   id="LT101--level"   id="P101--spin"   id="FT101--flow_2" (suffixe de doublon toléré)
 */
export declare function parseIdConvention(id: string | null | undefined): {
    tag: string;
    kind: Kind;
} | undefined;
/** Trouve toutes les liaisons déclarées sous `root`, par attributs data-hmi-<type> ou par convention d'id. */
export declare function collectBindings(root: Element): {
    el: SVGElement;
    tag: string;
    kind: Kind;
}[];
