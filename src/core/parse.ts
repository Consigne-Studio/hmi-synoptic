/** Petits analyseurs d'attributs, sans `eval` : rien dans un SVG ne peut exécuter du code. */

export type Value = number | string | boolean | null;

/** Lit un nombre. Renvoie undefined si absent ou invalide (accepte la virgule décimale). */
export function toNumber(raw: unknown): number | undefined {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw === 'boolean') return raw ? 1 : 0;
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  const n = Number(raw.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

/** Vrai au sens « procédé » : true, nombre non nul, "on", "true", "1", "running", "open". */
export function isTruthy(v: Value | undefined): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0 && Number.isFinite(v);
  const s = v.trim().toLowerCase();
  if (s === '' || s === '0' || s === 'false' || s === 'off' || s === 'stopped' || s === 'closed') return false;
  const n = Number(s);
  return Number.isNaN(n) ? true : n !== 0;
}

export type Predicate = (v: Value | undefined) => boolean;

const OPS = ['>=', '<=', '!=', '==', '>', '<', '='] as const;

/**
 * Condition textuelle : `> 50`, `<= 10`, `!= fault`, `== running`, `10..20` (bornes incluses),
 * `running|fault` (une des valeurs). Vide : test de vérité.
 */
export function parseCondition(raw: string | null | undefined): Predicate {
  const src = (raw ?? '').trim();
  if (src === '') return (v) => isTruthy(v);
  const range = /^(-?[\d.,]+)\s*\.\.\s*(-?[\d.,]+)$/.exec(src);
  if (range) {
    const a = toNumber(range[1]);
    const b = toNumber(range[2]);
    return (v) => {
      const n = toNumber(v);
      return n !== undefined && a !== undefined && b !== undefined && n >= a && n <= b;
    };
  }
  const op = OPS.find((o) => src.startsWith(o));
  if (!op) {
    const options = src.split('|').map((s) => s.trim().toLowerCase());
    return (v) => v !== null && v !== undefined && options.includes(String(v).toLowerCase());
  }
  const operand = src.slice(op.length).trim();
  if ((op === '==' || op === '=' || op === '!=') && operand.includes('|')) {
    const any = parseCondition(operand);
    return op === '!=' ? (v) => v !== null && v !== undefined && !any(v) : any;
  }
  const num = toNumber(operand);
  return (v) => {
    if (v === null || v === undefined) return false;
    const n = toNumber(v);
    if (num !== undefined && n !== undefined) {
      switch (op) {
        case '>': return n > num;
        case '>=': return n >= num;
        case '<': return n < num;
        case '<=': return n <= num;
        case '!=': return n !== num;
        default: return n === num;
      }
    }
    const eq = String(v).toLowerCase() === operand.toLowerCase();
    if (op === '!=') return !eq;
    if (op === '==' || op === '=') return eq;
    return false;
  };
}

/**
 * Table de correspondance `0:stopped, 1:running, 2:fault`.
 * Les clés peuvent être des conditions : `>80:high, <20:low, *:normal`. Première clé vraie gagnante.
 */
export type Mapping = (v: Value | undefined) => string | undefined;

export function parseMap(raw: string | null | undefined): Mapping | undefined {
  const src = (raw ?? '').trim();
  if (src === '') return undefined;
  const rules: [Predicate, string][] = [];
  for (const part of src.split(',')) {
    // Le dernier « : » sépare la clé de la valeur (les couleurs #rrggbb n'en contiennent pas).
    const i = part.lastIndexOf(':');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const out = part.slice(i + 1).trim();
    if (key === '*') rules.push([() => true, out]);
    else if (/^(>=|<=|!=|==|>|<|=)/.test(key) || key.includes('..')) rules.push([parseCondition(key), out]);
    else rules.push([parseCondition(`== ${key}`), out]);
  }
  return (v) => {
    const probe = typeof v === 'boolean' ? (v ? 1 : 0) : v;
    for (const [test, out] of rules) if (test(probe) || (typeof v === 'boolean' && test(String(v)))) return out;
    return undefined;
  };
}

/** Formate un nombre avec décimales fixes et unité facultative. */
export function formatValue(v: Value | undefined, decimals = 1, unit = '', locale = 'fr-FR'): string {
  if (v === null || v === undefined) return '---';
  if (typeof v === 'string') return unit ? `${v} ${unit}` : v;
  const n = toNumber(v);
  if (n === undefined) return '---';
  const d = Math.min(Math.max(Math.trunc(decimals), 0), 6);
  const s = new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
  return unit ? `${s}\u202f${unit}` : s;
}

/** Position bornée dans [0, 1]. */
export function ratio(v: number, min: number, max: number): number {
  if (!Number.isFinite(v) || !(max > min)) return 0;
  return Math.min(Math.max((v - min) / (max - min), 0), 1);
}
