import { alarmLevel, defaultPriority, type AlarmLevel } from './alarms.js';
import { collectBindings, type BindingInfo, type Kind, type Quality, type TagConfig, type TagConfigMap, type TagState } from './bindings.js';
import { bbox, parseNumbers, type Box } from './geometry.js';
import { formatValue, isTruthy, parseCondition, parseMap, ratio, toNumber, type Mapping, type Predicate, type Value } from './parse.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
let uid = 0;

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

interface Live {
  kind: Kind;
  tag: string;
  el: SVGElement;
  apply(s: TagState): void;
  /** Avance l'animation de dt secondes ; renvoie true tant qu'il reste du mouvement. */
  tick?(dt: number): boolean;
  dispose?(): void;
}

/** Marque ajoutée aux textes dont la donnée n'est pas « bonne ». */
export const QUALITY_MARK: Record<Quality, string> = { good: '', uncertain: '?', bad: '×', stale: '*' };

const RUN_WORDS = new Set(['running', 'run', 'on', 'open', 'opened', 'true', 'start', 'started', 'marche', 'ouvert', 'ouverte']);

/** « En marche » pour les animations : nombre non nul, true, ou un mot de marche. Un défaut ne tourne jamais. */
export function isRunning(v: Value | undefined): boolean {
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    const n = Number(s);
    return Number.isNaN(n) ? RUN_WORDS.has(s) : n !== 0;
  }
  return isTruthy(v);
}

/** Rapproche `cur` de `target` avec une constante de temps tau (s). */
function approach(cur: number, target: number, dt: number, tau: number): number {
  if (tau <= 0) return target;
  return target + (cur - target) * Math.exp(-dt / tau);
}

/** Moteur de liaison : anime un SVG déjà présent dans le DOM selon des variables. */
export class SynopticEngine {
  readonly svg: SVGSVGElement;
  private readonly lives: Live[] = [];
  private readonly byTag = new Map<string, Live[]>();
  private readonly states = new Map<string, TagState>();
  private readonly dirty = new Set<string>();
  private readonly animating = new Set<Live>();
  private readonly alarmMap = new Map<string, ActiveAlarm>();
  private config: TagConfigMap;
  private motion: boolean;
  private visible = true;
  private frame = 0;
  private last = 0;
  private defs?: SVGDefsElement;
  private readonly prefix = `hmi${++uid}`;
  private readonly opts: EngineOptions;

  constructor(svg: SVGSVGElement, opts: EngineOptions = {}) {
    this.svg = svg;
    this.opts = opts;
    this.config = opts.config ?? {};
    this.motion = opts.motion ?? true;
    for (const b of collectBindings(svg)) {
      const live = this.create(b.kind, b.tag, b.el);
      this.lives.push(live);
      const list = this.byTag.get(b.tag) ?? [];
      list.push(live);
      this.byTag.set(b.tag, list);
    }
  }

  /** Variables trouvées dans le SVG, triées. */
  get tags(): string[] {
    return [...this.byTag.keys()].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  }

  get bindings(): BindingInfo[] {
    return this.lives.map((l) => ({ tag: l.tag, kind: l.kind, id: l.el.getAttribute('id') ?? '' }));
  }

  /** Alarmes actives, de la plus prioritaire à la moins prioritaire, puis la plus récente d'abord. */
  get alarms(): ActiveAlarm[] {
    return [...this.alarmMap.values()].sort((a, b) => a.priority - b.priority || b.since - a.since);
  }

  /** Nombre de liaisons en mouvement (utile pour vérifier qu'au repos rien ne tourne). */
  get activeAnimations(): number {
    return this.animating.size;
  }

  get(tag: string): TagState | undefined {
    return this.states.get(tag);
  }

  setConfig(config: TagConfigMap): void {
    this.config = config;
    for (const tag of this.byTag.keys()) if (this.states.has(tag)) this.dirty.add(tag);
    this.schedule();
  }

  set(tag: string, value: Value, quality: Quality = 'good'): void {
    const prev = this.states.get(tag);
    if (prev && prev.value === value && prev.quality === quality) return;
    this.states.set(tag, { value, quality, updated: this.now() });
    if (this.byTag.has(tag)) {
      this.dirty.add(tag);
      this.schedule();
    }
  }

  update(values: Record<string, Value>, quality: Quality = 'good'): void {
    for (const [tag, v] of Object.entries(values)) this.set(tag, v, quality);
  }

  setQuality(tag: string, quality: Quality): void {
    const prev = this.states.get(tag);
    this.set(tag, prev?.value ?? null, quality);
  }

  /** Acquitte les alarmes d'une variable, ou toutes. */
  ack(tag?: string): void {
    for (const a of this.alarmMap.values()) {
      if (tag !== undefined && a.tag !== tag) continue;
      if (!a.acknowledged) {
        a.acknowledged = true;
        this.emit('hmi-alarm', { ...a, active: true });
      }
    }
    for (const l of this.lives) if (l.kind === 'alarm' && (tag === undefined || l.tag === tag) && l.el.hasAttribute('data-alarm')) l.el.setAttribute('data-ack', 'true');
  }

  setMotion(on: boolean): void {
    if (this.motion === on) return;
    this.motion = on;
    for (const tag of this.states.keys()) if (this.byTag.has(tag)) this.dirty.add(tag);
    this.schedule();
  }

  setVisible(on: boolean): void {
    this.visible = on;
    if (on) this.schedule();
  }

  /** Applique immédiatement les changements en attente (sinon : à la prochaine image). */
  flush(): void {
    for (const tag of this.dirty) {
      const s = this.states.get(tag);
      if (!s) continue;
      for (const l of this.byTag.get(tag) ?? []) {
        l.apply(s);
        if (s.quality === 'good') l.el.removeAttribute('data-quality');
        else l.el.setAttribute('data-quality', s.quality);
        if (l.tick) this.animating.add(l);
      }
    }
    this.dirty.clear();
  }

  /** Fait avancer les animations de dt secondes (appelé par la boucle, ou à la main dans les tests). */
  step(dt: number): void {
    this.flush();
    for (const l of this.animating) if (!l.tick?.(dt)) this.animating.delete(l);
  }

  destroy(): void {
    if (this.frame) {
      const cancel = this.opts.cancelFrame ?? (typeof cancelAnimationFrame !== 'undefined' ? cancelAnimationFrame : undefined);
      cancel?.(this.frame);
      this.frame = 0;
    }
    for (const l of this.lives) l.dispose?.();
    this.animating.clear();
  }

  // ---- boucle -------------------------------------------------------------

  private now(): number {
    return this.opts.now?.() ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
  }

  private schedule(): void {
    if (this.frame || !this.visible) return;
    const raf = this.opts.requestFrame ?? (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : undefined);
    if (!raf) return;
    this.last = 0;
    this.frame = raf((t) => this.loop(t));
  }

  private loop(t: number): void {
    this.frame = 0;
    const dt = this.last ? Math.min((t - this.last) / 1000, 0.1) : 1 / 60;
    this.last = t;
    this.step(dt);
    if (this.visible && (this.animating.size > 0 || this.dirty.size > 0)) {
      const raf = this.opts.requestFrame ?? requestAnimationFrame;
      this.frame = raf((n) => this.loop(n));
    }
  }

  private emit(type: string, detail: unknown): void {
    this.opts.emit?.(type, detail);
  }

  // ---- liaisons -----------------------------------------------------------

  private cfg(tag: string): TagConfig {
    return this.config[tag] ?? {};
  }

  private opt(el: Element, tag: string, name: keyof TagConfig | string): string | undefined {
    const a = el.getAttribute(`data-hmi-${name}`);
    if (a !== null) return a;
    const c = (this.cfg(tag) as Record<string, unknown>)[name];
    if (c === undefined || c === null) return undefined;
    if (typeof c === 'object') return Object.entries(c as Record<string, string>).map(([k, v]) => `${k}:${v}`).join(',');
    return String(c);
  }

  private num(el: Element, tag: string, name: string, fallback: number): number {
    return toNumber(this.opt(el, tag, name)) ?? fallback;
  }

  private ensureDefs(): SVGDefsElement {
    if (!this.defs) {
      this.defs = document.createElementNS(SVG_NS, 'defs') as SVGDefsElement;
      this.svg.insertBefore(this.defs, this.svg.firstChild);
    }
    return this.defs;
  }

  /** Enveloppe un élément dans un <g> : les transformations ajoutées n'écrasent jamais celles du dessin. */
  private wrap(el: SVGElement, cls: string): SVGGElement {
    const g = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    g.setAttribute('class', cls);
    el.parentNode?.insertBefore(g, el);
    g.appendChild(el);
    return g;
  }

  private create(kind: Kind, tag: string, el: SVGElement): Live {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- les liaisons sont des objets littéraux qui lisent l'état du moteur
    const self = this;
    const base = { kind, tag, el };
    switch (kind) {
      case 'level': {
        const dir = (el.getAttribute('data-hmi-dir') ?? 'up').toLowerCase();
        const clip = document.createElementNS(SVG_NS, 'clipPath');
        const id = `${this.prefix}-clip-${this.lives.length}`;
        clip.setAttribute('id', id);
        clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
        const rect = document.createElementNS(SVG_NS, 'rect');
        clip.appendChild(rect);
        this.ensureDefs().appendChild(clip);
        const wrapper = this.wrap(el, 'hmi-level');
        wrapper.setAttribute('clip-path', `url(#${id})`);
        let box: Box | undefined;
        let shown = 0;
        let target = 0;
        const draw = (r: number) => {
          box = box && box.height + box.width > 0 ? box : el.hasAttribute('data-hmi-box') ? bbox(el) : bbox(wrapper);
          const { x, y, width: w, height: h } = box;
          const pad = 2; // marge pour ne pas rogner le trait
          if (dir === 'down') rect.setAttribute('y', String(y - pad));
          else if (dir === 'up') rect.setAttribute('y', String(y + h * (1 - r)));
          if (dir === 'left') rect.setAttribute('x', String(x + w * (1 - r)));
          else rect.setAttribute('x', String(x - pad));
          const vertical = dir === 'up' || dir === 'down';
          rect.setAttribute('width', String(vertical ? w + 2 * pad : w * r));
          rect.setAttribute('height', String(vertical ? h * r + (dir === 'down' ? pad : 0) : h + 2 * pad));
          if (!vertical) rect.setAttribute('y', String(y - pad));
          if (dir === 'right') rect.setAttribute('x', String(x));
        };
        draw(0);
        return {
          ...base,
          apply(s) {
            const n = toNumber(s.value);
            target = n === undefined ? 0 : ratio(n, self.num(el, tag, 'min', 0), self.num(el, tag, 'max', 100));
            el.setAttribute('data-level', target.toFixed(3));
            if (!self.motion) {
              shown = target;
              draw(shown);
            }
          },
          tick(dt) {
            shown = approach(shown, target, dt, self.motion ? 0.25 : 0);
            if (Math.abs(shown - target) < 0.0005) shown = target;
            draw(shown);
            return shown !== target;
          },
        };
      }

      case 'spin': {
        const wrapper = this.wrap(el, 'hmi-spin');
        let origin: number[] | undefined;
        let angle = 0;
        let speed = 0;
        let target = 0;
        const center = () => {
          if (origin && origin.length === 2) return origin;
          const o = parseNumbers(el.getAttribute('data-hmi-origin'));
          if (o.length === 2) return (origin = o);
          const b = bbox(wrapper);
          const c = [b.x + b.width / 2, b.y + b.height / 2];
          if (b.width + b.height > 0) origin = c;
          return c;
        };
        return {
          ...base,
          apply(s) {
            const when = el.getAttribute('data-hmi-when');
            const run = when ? parseCondition(when)(s.value) : isRunning(s.value);
            const max = toNumber(self.opt(el, tag, 'max'));
            const n = toNumber(s.value);
            const factor = !run ? 0 : max !== undefined && n !== undefined && !when ? Math.max(-1, Math.min(n / max, 1)) : 1;
            target = self.num(el, tag, 'speed', 0.6) * factor; // tours par seconde
            el.setAttribute('data-spinning', String(run));
            if (!self.motion) speed = 0;
          },
          tick(dt) {
            if (!self.motion) return false;
            speed = approach(speed, target, dt, self.num(el, tag, 'inertia', 0.8));
            if (Math.abs(speed - target) < 0.002) speed = target;
            angle = (angle + speed * 360 * dt) % 360;
            const [cx, cy] = center();
            wrapper.setAttribute('transform', `rotate(${angle.toFixed(2)} ${cx} ${cy})`);
            return speed !== 0 || target !== 0;
          },
        };
      }

      case 'angle': {
        const wrapper = this.wrap(el, 'hmi-angle');
        let shown = Number.NaN;
        let target = 0;
        const render = () => {
          const o = parseNumbers(el.getAttribute('data-hmi-origin'));
          let [cx, cy] = o;
          if (o.length !== 2) {
            const b = bbox(wrapper);
            [cx, cy] = [b.x + b.width / 2, b.y + b.height / 2];
          }
          wrapper.setAttribute('transform', `rotate(${shown.toFixed(2)} ${cx} ${cy})`);
        };
        return {
          ...base,
          apply(s) {
            const n = toNumber(s.value) ?? 0;
            const r = ratio(n, self.num(el, tag, 'min', 0), self.num(el, tag, 'max', 100));
            const a0 = self.num(el, tag, 'angle-min', 0);
            const a1 = self.num(el, tag, 'angle-max', 90);
            target = a0 + (a1 - a0) * r;
            if (!self.motion || Number.isNaN(shown)) {
              shown = target;
              render();
            }
          },
          tick(dt) {
            shown = approach(shown, target, dt, self.motion ? 0.2 : 0);
            if (Math.abs(shown - target) < 0.05) shown = target;
            render();
            return shown !== target;
          },
        };
      }

      case 'move': {
        // Translation proportionnelle : curseur de barre analogique, tige de vérin, registre…
        const wrapper = this.wrap(el, 'hmi-move');
        let shown = Number.NaN;
        let target = 0;
        const render = () => {
          const dir = (el.getAttribute('data-hmi-dir') ?? 'up').toLowerCase();
          const d = shown;
          const [dx, dy] = dir === 'up' ? [0, -d] : dir === 'down' ? [0, d] : dir === 'left' ? [-d, 0] : [d, 0];
          wrapper.setAttribute('transform', `translate(${dx.toFixed(2)} ${dy.toFixed(2)})`);
        };
        return {
          ...base,
          apply(s) {
            const n = toNumber(s.value);
            const r = n === undefined ? 0 : ratio(n, self.num(el, tag, 'min', 0), self.num(el, tag, 'max', 100));
            target = r * self.num(el, tag, 'distance', 100);
            if (!self.motion || Number.isNaN(shown)) {
              shown = target;
              render();
            }
          },
          tick(dt) {
            shown = approach(shown, target, dt, self.motion ? 0.25 : 0);
            if (Math.abs(shown - target) < 0.02) shown = target;
            render();
            return shown !== target;
          },
        };
      }

      case 'flow': {
        if (!el.getAttribute('stroke-dasharray') && !(el.getAttribute('style') ?? '').includes('dasharray')) el.setAttribute('stroke-dasharray', '10 10');
        const period = parseNumbers(el.getAttribute('stroke-dasharray')).reduce((a, b) => a + b, 0) || 20;
        let offset = 0;
        let speed = 0;
        let target = 0;
        return {
          ...base,
          apply(s) {
            const when = el.getAttribute('data-hmi-when');
            const max = toNumber(self.opt(el, tag, 'max'));
            const n = toNumber(s.value);
            // Zone morte : un débit résiduel (bruit de mesure) n'anime pas la ligne. Défaut : 1 % de max.
            const dead = self.num(el, tag, 'deadband', max !== undefined ? Math.abs(max) * 0.01 : 0);
            const run = when ? parseCondition(when)(s.value) : n !== undefined && typeof s.value === 'number' ? Math.abs(n) > dead : isRunning(s.value);
            const factor = !run ? 0 : max !== undefined && n !== undefined && !when ? Math.max(-1, Math.min(n / max, 1)) : 1;
            target = self.num(el, tag, 'speed', 30) * factor; // px par seconde
            el.setAttribute('data-flowing', String(run && factor !== 0));
            if (factor < 0) el.setAttribute('data-reverse', 'true');
            else el.removeAttribute('data-reverse');
          },
          tick(dt) {
            if (!self.motion) return false;
            speed = approach(speed, target, dt, 0.4);
            if (Math.abs(speed - target) < 0.05) speed = target;
            offset = (offset - speed * dt) % period;
            el.setAttribute('stroke-dashoffset', offset.toFixed(2));
            return speed !== 0 || target !== 0;
          },
        };
      }

      case 'text': {
        // Inkscape place le texte dans un <tspan> positionné : on écrit dans le dernier pour garder la mise en page.
        const spans = el.querySelectorAll('tspan');
        const target = spans.length > 0 ? spans[spans.length - 1] : el;
        return {
          ...base,
          apply(s) {
            const map = self.mapping(el, tag);
            const mapped = map?.(s.value);
            const txt = mapped ?? formatValue(s.value, self.num(el, tag, 'decimals', 1), self.opt(el, tag, 'unit') ?? '');
            // Qualité douteuse : la valeur reste lisible mais marquée (jamais par la couleur seule).
            target.textContent = s.quality === 'good' ? txt : `${txt} ${QUALITY_MARK[s.quality]}`;
          },
        };
      }

      case 'state': {
        return {
          ...base,
          apply(s) {
            const mapped = self.mapping(el, tag)?.(s.value);
            el.setAttribute('data-state', mapped ?? String(s.value ?? 'unknown'));
          },
        };
      }

      case 'visible': {
        const test = parseCondition(el.getAttribute('data-hmi-when'));
        const initial = el.style.display;
        return {
          ...base,
          apply(s) {
            el.style.display = test(s.value) ? initial : 'none';
          },
        };
      }

      case 'blink': {
        const test = parseCondition(el.getAttribute('data-hmi-when'));
        return {
          ...base,
          apply(s) {
            if (test(s.value)) el.setAttribute('data-blink', 'true');
            else el.removeAttribute('data-blink');
          },
        };
      }

      case 'fill':
      case 'stroke': {
        return {
          ...base,
          apply(s) {
            const color = (parseMap(el.getAttribute('data-hmi-colors')) ?? self.mapping(el, tag))?.(s.value);
            el.style.setProperty(kind, color ?? '');
          },
        };
      }

      case 'alarm':
        return this.alarmBinding(el, tag, this.lives.length);

      case 'select': {
        const label = el.getAttribute('data-hmi-label') ?? this.cfg(tag).label ?? tag;
        el.setAttribute('tabindex', '0');
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', label);
        el.setAttribute('focusable', 'true');
        const fire = () => this.emit('hmi-select', { tag, id: el.getAttribute('id') ?? '', label });
        const onClick = () => fire();
        const onKey = (e: Event) => {
          const k = (e as KeyboardEvent).key;
          if (k === 'Enter' || k === ' ') {
            e.preventDefault();
            fire();
          }
        };
        el.addEventListener('click', onClick);
        el.addEventListener('keydown', onKey);
        return {
          ...base,
          apply() {
            /* l'état visuel vient des autres liaisons */
          },
          dispose() {
            el.removeEventListener('click', onClick);
            el.removeEventListener('keydown', onKey);
          },
        };
      }
    }
  }

  private mapping(el: Element, tag: string): Mapping | undefined {
    return parseMap(this.opt(el, tag, 'map'));
  }

  private alarmBinding(el: SVGElement, tag: string, index: number): Live {
    const when = el.getAttribute('data-hmi-when');
    const test: Predicate | undefined = when ? parseCondition(when) : undefined;
    const txt = el.querySelector('.hmi-ind-p');
    let level: AlarmLevel | undefined;
    const key = `${tag}#${index}`;
    return {
      kind: 'alarm',
      tag,
      el,
      apply: (s) => {
        const lim = {
          ll: toNumber(this.opt(el, tag, 'll')),
          l: toNumber(this.opt(el, tag, 'l')),
          h: toNumber(this.opt(el, tag, 'h')),
          hh: toNumber(this.opt(el, tag, 'hh')),
        };
        const next = test ? (test(s.value) ? 'on' : undefined) : alarmLevel(s.value, lim, level, this.num(el, tag, 'deadband', 0));
        if (next === level) {
          const a = this.alarmMap.get(key);
          if (a) a.value = s.value;
          return;
        }
        level = next;
        if (!next) {
          el.removeAttribute('data-alarm');
          el.removeAttribute('data-priority');
          el.removeAttribute('data-ack');
          const a = this.alarmMap.get(key);
          if (a) {
            this.alarmMap.delete(key);
            this.emit('hmi-alarm', { ...a, value: s.value, active: false });
          }
          return;
        }
        const fixed = toNumber(el.getAttribute('data-hmi-priority'));
        const priority = (fixed && fixed >= 1 && fixed <= 4 ? Math.trunc(fixed) : defaultPriority(next)) as 1 | 2 | 3 | 4;
        el.setAttribute('data-alarm', next);
        el.setAttribute('data-priority', String(priority));
        el.setAttribute('data-ack', 'false');
        if (txt) txt.textContent = String(priority);
        const alarm: ActiveAlarm = {
          tag,
          level: next,
          priority,
          value: s.value,
          label: el.getAttribute('data-hmi-message') ?? this.cfg(tag).label ?? tag,
          acknowledged: false,
          since: Date.now(),
        };
        this.alarmMap.set(key, alarm);
        this.emit('hmi-alarm', { ...alarm, active: true });
      },
    };
  }
}
