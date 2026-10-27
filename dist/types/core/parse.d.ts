/** Petits analyseurs d'attributs, sans `eval` : rien dans un SVG ne peut exécuter du code. */
export type Value = number | string | boolean | null;
/** Lit un nombre. Renvoie undefined si absent ou invalide (accepte la virgule décimale). */
export declare function toNumber(raw: unknown): number | undefined;
/** Vrai au sens « procédé » : true, nombre non nul, "on", "true", "1", "running", "open". */
export declare function isTruthy(v: Value | undefined): boolean;
export type Predicate = (v: Value | undefined) => boolean;
/**
 * Condition textuelle : `> 50`, `<= 10`, `!= fault`, `== running`, `10..20` (bornes incluses),
 * `running|fault` (une des valeurs). Vide : test de vérité.
 */
export declare function parseCondition(raw: string | null | undefined): Predicate;
/**
 * Table de correspondance `0:stopped, 1:running, 2:fault`.
 * Les clés peuvent être des conditions : `>80:high, <20:low, *:normal`. Première clé vraie gagnante.
 */
export type Mapping = (v: Value | undefined) => string | undefined;
export declare function parseMap(raw: string | null | undefined): Mapping | undefined;
/** Formate un nombre avec décimales fixes et unité facultative. */
export declare function formatValue(v: Value | undefined, decimals?: number, unit?: string, locale?: string): string;
/** Position bornée dans [0, 1]. */
export declare function ratio(v: number, min: number, max: number): number;
