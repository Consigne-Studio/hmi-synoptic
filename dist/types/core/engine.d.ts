import { type AlarmLevel } from './alarms.js';
import { type BindingInfo, type Quality, type TagConfigMap, type TagState } from './bindings.js';
import { type Value } from './parse.js';
export interface ActiveAlarm {
    tag: string;
    level: AlarmLevel;
    priority: 1 | 2 | 3 | 4;
    value: Value | undefined;
    label: string;
    acknowledged: boolean;
    since: number;
}
export interface EngineOptions {
    config?: TagConfigMap;
    /** false : aucune animation continue, les transitions sont instantanées (prefers-reduced-motion). */
    motion?: boolean;
    /** Reçoit hmi-select, hmi-alarm. */
    emit?: (type: string, detail: unknown) => void;
    /** Injectables pour les tests. */
    requestFrame?: (cb: (t: number) => void) => number;
    cancelFrame?: (id: number) => void;
    now?: () => number;
}
/** Marque ajoutée aux textes dont la donnée n'est pas « bonne ». */
export declare const QUALITY_MARK: Record<Quality, string>;
/** « En marche » pour les animations : nombre non nul, true, ou un mot de marche. Un défaut ne tourne jamais. */
export declare function isRunning(v: Value | undefined): boolean;
/** Moteur de liaison : anime un SVG déjà présent dans le DOM selon des variables. */
export declare class SynopticEngine {
    readonly svg: SVGSVGElement;
    private readonly lives;
    private readonly byTag;
    private readonly states;
    private readonly dirty;
    private readonly animating;
    private readonly alarmMap;
    private config;
    private motion;
    private visible;
    private frame;
    private last;
    private defs?;
    private readonly prefix;
    private readonly opts;
    constructor(svg: SVGSVGElement, opts?: EngineOptions);
    /** Variables trouvées dans le SVG, triées. */
    get tags(): string[];
    get bindings(): BindingInfo[];
    /** Alarmes actives, de la plus prioritaire à la moins prioritaire, puis la plus récente d'abord. */
    get alarms(): ActiveAlarm[];
    /** Nombre de liaisons en mouvement (utile pour vérifier qu'au repos rien ne tourne). */
    get activeAnimations(): number;
    get(tag: string): TagState | undefined;
    setConfig(config: TagConfigMap): void;
    set(tag: string, value: Value, quality?: Quality): void;
    update(values: Record<string, Value>, quality?: Quality): void;
    setQuality(tag: string, quality: Quality): void;
    /** Acquitte les alarmes d'une variable, ou toutes. */
    ack(tag?: string): void;
    setMotion(on: boolean): void;
    setVisible(on: boolean): void;
    /** Applique immédiatement les changements en attente (sinon : à la prochaine image). */
    flush(): void;
    /** Fait avancer les animations de dt secondes (appelé par la boucle, ou à la main dans les tests). */
    step(dt: number): void;
    destroy(): void;
    private now;
    private schedule;
    private loop;
    private emit;
    private cfg;
    private opt;
    private num;
    private ensureDefs;
    /** Enveloppe un élément dans un <g> : les transformations ajoutées n'écrasent jamais celles du dessin. */
    private wrap;
    private create;
    private mapping;
    private alarmBinding;
}
