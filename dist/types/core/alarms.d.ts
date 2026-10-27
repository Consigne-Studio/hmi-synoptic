import { type Value } from './parse.js';
export type AlarmLevel = 'hh' | 'h' | 'l' | 'll' | 'on';
export interface Limits {
    ll?: number;
    l?: number;
    h?: number;
    hh?: number;
}
/** Niveau d'alarme d'une valeur analogique. Les seuils « très » priment. Hystérésis facultative. */
export declare function alarmLevel(v: Value | undefined, lim: Limits, previous?: AlarmLevel, hysteresis?: number): AlarmLevel | undefined;
/** Priorité par défaut (1 = critique) : seuils « très » en 1, seuils simples en 2, alarmes TOR en 2. */
export declare function defaultPriority(level: AlarmLevel): 1 | 2 | 3 | 4;
export declare const ALARM_LABELS: Record<AlarmLevel, string>;
