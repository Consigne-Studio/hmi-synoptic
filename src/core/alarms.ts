import { toNumber, type Value } from './parse.js';

export type AlarmLevel = 'hh' | 'h' | 'l' | 'll' | 'on';

export interface Limits {
  ll?: number;
  l?: number;
  h?: number;
  hh?: number;
}

/** Niveau d'alarme d'une valeur analogique. Les seuils « très » priment. Hystérésis facultative. */
export function alarmLevel(v: Value | undefined, lim: Limits, previous?: AlarmLevel, hysteresis = 0): AlarmLevel | undefined {
  const n = toNumber(v);
  if (n === undefined) return undefined;
  const above = (t: number | undefined, was: boolean) => t !== undefined && n >= (was ? t - hysteresis : t);
  const below = (t: number | undefined, was: boolean) => t !== undefined && n <= (was ? t + hysteresis : t);
  if (above(lim.hh, previous === 'hh')) return 'hh';
  if (above(lim.h, previous === 'h' || previous === 'hh')) return 'h';
  if (below(lim.ll, previous === 'll')) return 'll';
  if (below(lim.l, previous === 'l' || previous === 'll')) return 'l';
  return undefined;
}

/** Priorité par défaut (1 = critique) : seuils « très » en 1, seuils simples en 2, alarmes TOR en 2. */
export function defaultPriority(level: AlarmLevel): 1 | 2 | 3 | 4 {
  return level === 'hh' || level === 'll' ? 1 : 2;
}

export const ALARM_LABELS: Record<AlarmLevel, string> = {
  hh: 'Très haut',
  h: 'Haut',
  l: 'Bas',
  ll: 'Très bas',
  on: 'Alarme',
};
