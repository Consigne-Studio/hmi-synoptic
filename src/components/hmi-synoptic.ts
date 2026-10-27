import { SynopticEngine, type ActiveAlarm } from '../core/engine.js';
import type { BindingInfo, Quality, TagConfigMap, TagState } from '../core/bindings.js';
import type { Value } from '../core/parse.js';
import { parseSvg, type SanitizeReport } from '../core/sanitize.js';
import { SYNOPTIC_CSS } from '../theme.js';

// Repli SSR : l'import côté serveur ne plante pas, l'élément n'est simplement pas défini.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- repli SSR volontairement vide
const SafeHTMLElement = (typeof HTMLElement !== 'undefined' ? HTMLElement : class {}) as typeof HTMLElement;

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
export class HmiSynoptic extends SafeHTMLElement {
  static observedAttributes = ['src', 'motion', 'theme', 'label'];

  private readonly root: ShadowRoot;
  private engine?: SynopticEngine;
  private pending: [string, Value, Quality][] = [];
  private _config: TagConfigMap = {};
  private _source?: string;
  private loadToken = 0;
  private io?: IntersectionObserver;
  private mo?: MutationObserver;
  private mq?: MediaQueryList;
  private readonly onMq = () => this.syncMotion();

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = `<style>${SYNOPTIC_CSS}</style><div class="hmi-host" part="canvas"></div>`;
  }

  // ---- API publique ----------------------------------------------------

  /** Écrit une variable. Les mises à jour sont regroupées et appliquées à la prochaine image. */
  set(tag: string, value: Value, quality: Quality = 'good'): void {
    if (this.engine) this.engine.set(tag, value, quality);
    else this.pending.push([tag, value, quality]);
  }

  /** Écrit plusieurs variables d'un coup : `update({ LT101: 62, P101: 'running' })`. */
  update(values: Record<string, Value>, quality: Quality = 'good'): void {
    for (const [k, v] of Object.entries(values)) this.set(k, v, quality);
  }

  setQuality(tag: string, quality: Quality): void {
    this.set(tag, this.get(tag)?.value ?? null, quality);
  }

  get(tag: string): TagState | undefined {
    return this.engine?.get(tag);
  }

  /** Acquitte les alarmes d'une variable, ou toutes. */
  ack(tag?: string): void {
    this.engine?.ack(tag);
  }

  /** Applique tout de suite les mises à jour en attente (tests, captures). */
  flush(): void {
    this.engine?.flush();
  }

  get tags(): string[] {
    return this.engine?.tags ?? [];
  }

  get bindings(): BindingInfo[] {
    return this.engine?.bindings ?? [];
  }

  /** Diagnostic : nombre de liaisons en mouvement (0 au repos : aucune image calculée). */
  get activeAnimations(): number {
    return this.engine?.activeAnimations ?? 0;
  }

  get alarms(): ActiveAlarm[] {
    return this.engine?.alarms ?? [];
  }

  /** L'élément <svg> affiché (après nettoyage). */
  get svg(): SVGSVGElement | null {
    return this.root.querySelector('svg');
  }

  get config(): TagConfigMap {
    return this._config;
  }

  /** Métadonnées des variables : bornes, unité, décimales, seuils, correspondances. */
  set config(c: TagConfigMap) {
    this._config = c ?? {};
    this.engine?.setConfig(this._config);
  }

  get source(): string | undefined {
    return this._source;
  }

  /** Code SVG à afficher (chaîne). Remplace `src`. */
  set source(svg: string | undefined) {
    this._source = svg;
    if (svg !== undefined) this.mount(svg);
  }

  // ---- cycle de vie ----------------------------------------------------

  connectedCallback(): void {
    const json = this.querySelector('script[type="application/json"]');
    if (json?.textContent && Object.keys(this._config).length === 0) {
      try {
        this._config = JSON.parse(json.textContent) as TagConfigMap;
      } catch {
        this.fail('configuration JSON illisible');
      }
    }
    this.syncTheme();
    this.setAttribute('data-motion', this.motionEnabled() ? 'on' : 'off');
    if (!this.mo && typeof MutationObserver !== 'undefined') {
      this.mo = new MutationObserver(() => this.syncTheme());
      this.mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-hmi-theme'] });
    }
    if (!this.mq && typeof matchMedia !== 'undefined') {
      this.mq = matchMedia('(prefers-reduced-motion: reduce)');
      this.mq.addEventListener?.('change', this.onMq);
    }
    if (!this.io && typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver((entries) => this.engine?.setVisible(entries.some((e) => e.isIntersecting)));
      this.io.observe(this);
    }
    if (!this.engine) {
      if (this._source !== undefined) this.mount(this._source);
      else if (this.hasAttribute('src')) void this.load(this.getAttribute('src') ?? '');
      else {
        const tpl = this.querySelector('template');
        if (tpl) this.mount(tpl.innerHTML);
      }
    }
  }

  disconnectedCallback(): void {
    this.io?.disconnect();
    this.io = undefined;
    this.mo?.disconnect();
    this.mo = undefined;
    this.mq?.removeEventListener?.('change', this.onMq);
    this.mq = undefined;
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    if (old === value) return;
    if (name === 'src' && value && this.isConnected && this._source === undefined) void this.load(value);
    if (name === 'motion') this.syncMotion();
    if (name === 'theme') this.syncTheme();
    if (name === 'label') this.svg?.setAttribute('aria-label', value ?? '');
  }

  // ---- interne -----------------------------------------------------------

  private async load(url: string): Promise<void> {
    const token = ++this.loadToken;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (token === this.loadToken) this.mount(text);
    } catch (e) {
      if (token === this.loadToken) this.fail(`impossible de charger ${url} (${(e as Error).message})`);
    }
  }

  private mount(source: string): void {
    let parsed: ReturnType<typeof parseSvg>;
    try {
      parsed = parseSvg(source);
    } catch (e) {
      this.fail((e as Error).message);
      return;
    }
    const host = this.root.querySelector('.hmi-host');
    if (!host) return;
    const previous = this.engine;
    const keep = previous ? previous.tags.map((t) => [t, previous.get(t)] as const) : [];
    previous?.destroy();
    const svg = document.importNode(parsed.svg, true) as SVGSVGElement;
    svg.classList.add('hmi-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', this.getAttribute('label') ?? svg.querySelector('title')?.textContent ?? 'Synoptique');
    host.replaceChildren(svg);
    this.engine = new SynopticEngine(svg, {
      config: this._config,
      motion: this.motionEnabled(),
      emit: (type, detail) => this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true })),
    });
    for (const [t, s] of keep) if (s) this.engine.set(t, s.value ?? null, s.quality);
    for (const [t, v, q] of this.pending) this.engine.set(t, v, q);
    this.pending = [];
    this.engine.flush();
    const detail: SynopticLoadDetail = { tags: this.engine.tags, bindings: this.engine.bindings, sanitized: parsed.report };
    this.dispatchEvent(new CustomEvent('hmi-load', { detail }));
  }

  private fail(message: string): void {
    const host = this.root.querySelector('.hmi-host');
    if (host) host.innerHTML = `<p role="alert" part="error" style="font:13px var(--_mono);color:var(--_a1);padding:12px;border:1px dashed currentColor">hmi-synoptic : ${message.replace(/[<>&]/g, '')}</p>`;
    this.dispatchEvent(new CustomEvent('hmi-error', { detail: { message } }));
  }

  private motionEnabled(): boolean {
    const m = this.getAttribute('motion');
    if (m === 'off') return false;
    if (m === 'on') return true;
    return !(this.mq?.matches ?? (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches));
  }

  private syncMotion(): void {
    const on = this.motionEnabled();
    this.setAttribute('data-motion', on ? 'on' : 'off');
    this.engine?.setMotion(on);
  }

  private syncTheme(): void {
    const own = this.getAttribute('theme');
    const inherited = (this.closest('[data-hmi-theme]') as HTMLElement | null)?.getAttribute('data-hmi-theme');
    const theme = own && own !== 'auto' ? own : inherited ?? 'light';
    this.setAttribute('data-theme', theme);
  }
}

export function defineSynoptic(tag = 'hmi-synoptic'): void {
  if (typeof customElements !== 'undefined' && !customElements.get(tag)) customElements.define(tag, HmiSynoptic);
}

defineSynoptic();
