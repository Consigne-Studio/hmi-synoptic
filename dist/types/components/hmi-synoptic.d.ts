import { type ActiveAlarm } from '../core/engine.js';
import type { BindingInfo, Quality, TagConfigMap, TagState } from '../core/bindings.js';
import type { Value } from '../core/parse.js';
import { type SanitizeReport } from '../core/sanitize.js';
declare const SafeHTMLElement: typeof HTMLElement;
export interface SynopticLoadDetail {
    tags: string[];
    bindings: BindingInfo[];
    sanitized: SanitizeReport;
}
/**
 * Synoptique animé.
 *   <hmi-synoptic src="station.svg"></hmi-synoptic>
 *   synoptique.update({ LT101: 62, P101: 'running' });
 * Le SVG peut aussi être fourni dans un <template> enfant ou par la propriété `source`.
 */
export declare class HmiSynoptic extends SafeHTMLElement {
    static observedAttributes: string[];
    private readonly root;
    private engine?;
    private pending;
    private _config;
    private _source?;
    private loadToken;
    private io?;
    private mo?;
    private mq?;
    private readonly onMq;
    constructor();
    /** Écrit une variable. Les mises à jour sont regroupées et appliquées à la prochaine image. */
    set(tag: string, value: Value, quality?: Quality): void;
    /** Écrit plusieurs variables d'un coup : `update({ LT101: 62, P101: 'running' })`. */
    update(values: Record<string, Value>, quality?: Quality): void;
    setQuality(tag: string, quality: Quality): void;
    get(tag: string): TagState | undefined;
    /** Acquitte les alarmes d'une variable, ou toutes. */
    ack(tag?: string): void;
    /** Applique tout de suite les mises à jour en attente (tests, captures). */
    flush(): void;
    get tags(): string[];
    get bindings(): BindingInfo[];
    /** Diagnostic : nombre de liaisons en mouvement (0 au repos : aucune image calculée). */
    get activeAnimations(): number;
    get alarms(): ActiveAlarm[];
    /** L'élément <svg> affiché (après nettoyage). */
    get svg(): SVGSVGElement | null;
    get config(): TagConfigMap;
    /** Métadonnées des variables : bornes, unité, décimales, seuils, correspondances. */
    set config(c: TagConfigMap);
    get source(): string | undefined;
    /** Code SVG à afficher (chaîne). Remplace `src`. */
    set source(svg: string | undefined);
    connectedCallback(): void;
    disconnectedCallback(): void;
    attributeChangedCallback(name: string, old: string | null, value: string | null): void;
    private load;
    private mount;
    private fail;
    private motionEnabled;
    private syncMotion;
    private syncTheme;
}
export declare function defineSynoptic(tag?: string): void;
export {};
