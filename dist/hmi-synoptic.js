// src/core/parse.ts
function toNumber(raw) {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : void 0;
  if (typeof raw === "boolean") return raw ? 1 : 0;
  if (typeof raw !== "string" || raw.trim() === "") return void 0;
  const n = Number(raw.trim().replace(",", "."));
  return Number.isFinite(n) ? n : void 0;
}
function isTruthy(v) {
  if (v === null || v === void 0) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0 && Number.isFinite(v);
  const s = v.trim().toLowerCase();
  if (s === "" || s === "0" || s === "false" || s === "off" || s === "stopped" || s === "closed") return false;
  const n = Number(s);
  return Number.isNaN(n) ? true : n !== 0;
}
var OPS = [">=", "<=", "!=", "==", ">", "<", "="];
function parseCondition(raw) {
  const src = (raw ?? "").trim();
  if (src === "") return (v) => isTruthy(v);
  const range = /^(-?[\d.,]+)\s*\.\.\s*(-?[\d.,]+)$/.exec(src);
  if (range) {
    const a = toNumber(range[1]);
    const b = toNumber(range[2]);
    return (v) => {
      const n = toNumber(v);
      return n !== void 0 && a !== void 0 && b !== void 0 && n >= a && n <= b;
    };
  }
  const op = OPS.find((o) => src.startsWith(o));
  if (!op) {
    const options = src.split("|").map((s) => s.trim().toLowerCase());
    return (v) => v !== null && v !== void 0 && options.includes(String(v).toLowerCase());
  }
  const operand = src.slice(op.length).trim();
  if ((op === "==" || op === "=" || op === "!=") && operand.includes("|")) {
    const any = parseCondition(operand);
    return op === "!=" ? (v) => v !== null && v !== void 0 && !any(v) : any;
  }
  const num2 = toNumber(operand);
  return (v) => {
    if (v === null || v === void 0) return false;
    const n = toNumber(v);
    if (num2 !== void 0 && n !== void 0) {
      switch (op) {
        case ">":
          return n > num2;
        case ">=":
          return n >= num2;
        case "<":
          return n < num2;
        case "<=":
          return n <= num2;
        case "!=":
          return n !== num2;
        default:
          return n === num2;
      }
    }
    const eq = String(v).toLowerCase() === operand.toLowerCase();
    if (op === "!=") return !eq;
    if (op === "==" || op === "=") return eq;
    return false;
  };
}
function parseMap(raw) {
  const src = (raw ?? "").trim();
  if (src === "") return void 0;
  const rules = [];
  for (const part of src.split(",")) {
    const i = part.lastIndexOf(":");
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const out = part.slice(i + 1).trim();
    if (key === "*") rules.push([() => true, out]);
    else if (/^(>=|<=|!=|==|>|<|=)/.test(key) || key.includes("..")) rules.push([parseCondition(key), out]);
    else rules.push([parseCondition(`== ${key}`), out]);
  }
  return (v) => {
    const probe = typeof v === "boolean" ? v ? 1 : 0 : v;
    for (const [test, out] of rules) if (test(probe) || typeof v === "boolean" && test(String(v))) return out;
    return void 0;
  };
}
function formatValue(v, decimals = 1, unit = "", locale = "fr-FR") {
  if (v === null || v === void 0) return "---";
  if (typeof v === "string") return unit ? `${v} ${unit}` : v;
  const n = toNumber(v);
  if (n === void 0) return "---";
  const d = Math.min(Math.max(Math.trunc(decimals), 0), 6);
  const s = new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
  return unit ? `${s}\u202F${unit}` : s;
}
function ratio(v, min, max) {
  if (!Number.isFinite(v) || !(max > min)) return 0;
  return Math.min(Math.max((v - min) / (max - min), 0), 1);
}

// src/core/alarms.ts
function alarmLevel(v, lim, previous, hysteresis = 0) {
  const n = toNumber(v);
  if (n === void 0) return void 0;
  const above = (t, was) => t !== void 0 && n >= (was ? t - hysteresis : t);
  const below = (t, was) => t !== void 0 && n <= (was ? t + hysteresis : t);
  if (above(lim.hh, previous === "hh")) return "hh";
  if (above(lim.h, previous === "h" || previous === "hh")) return "h";
  if (below(lim.ll, previous === "ll")) return "ll";
  if (below(lim.l, previous === "l" || previous === "ll")) return "l";
  return void 0;
}
function defaultPriority(level) {
  return level === "hh" || level === "ll" ? 1 : 2;
}
var ALARM_LABELS = {
  hh: "Tr\xE8s haut",
  h: "Haut",
  l: "Bas",
  ll: "Tr\xE8s bas",
  on: "Alarme"
};

// src/core/bindings.ts
var KINDS = ["level", "spin", "angle", "move", "flow", "text", "state", "visible", "alarm", "fill", "stroke", "blink", "select"];
var KIND_SET = new Set(KINDS);
function parseIdConvention(id) {
  if (!id) return void 0;
  const parts = id.split("--");
  if (parts.length < 2) return void 0;
  const tag = parts[0].trim();
  const kind = parts[1].trim().toLowerCase().replace(/[_-]\d+$/, "");
  if (!tag || !KIND_SET.has(kind)) return void 0;
  return { tag, kind };
}
function collectBindings(root) {
  const found = [];
  const all = [root, ...Array.from(root.querySelectorAll("*"))];
  for (const el of all) {
    const seen = /* @__PURE__ */ new Set();
    for (const kind of KINDS) {
      const tag = el.getAttribute(`data-hmi-${kind}`);
      if (tag && tag.trim()) {
        found.push({ el, tag: tag.trim(), kind });
        seen.add(kind);
      }
    }
    for (const name of [el.getAttribute("id"), el.getAttribute("inkscape:label"), el.getAttribute("data-name")]) {
      const conv = parseIdConvention(name);
      if (conv && !seen.has(conv.kind)) {
        found.push({ el, ...conv });
        seen.add(conv.kind);
      }
    }
  }
  return found;
}

// src/core/geometry.ts
var num = (el, name) => Number(el.getAttribute(name)) || 0;
function parseNumbers(raw) {
  if (!raw) return [];
  return raw.trim().split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
}
function bbox(el) {
  const explicit = parseNumbers(el.getAttribute("data-hmi-box"));
  if (explicit.length === 4) return { x: explicit[0], y: explicit[1], width: explicit[2], height: explicit[3] };
  const g = el;
  if (typeof g.getBBox === "function") {
    try {
      const b = g.getBBox();
      if (b.width > 0 || b.height > 0) return { x: b.x, y: b.y, width: b.width, height: b.height };
    } catch {
    }
  }
  switch (el.localName) {
    case "rect":
    case "image":
    case "use":
      return { x: num(el, "x"), y: num(el, "y"), width: num(el, "width"), height: num(el, "height") };
    case "circle": {
      const r = num(el, "r");
      return { x: num(el, "cx") - r, y: num(el, "cy") - r, width: 2 * r, height: 2 * r };
    }
    case "ellipse": {
      const rx = num(el, "rx");
      const ry = num(el, "ry");
      return { x: num(el, "cx") - rx, y: num(el, "cy") - ry, width: 2 * rx, height: 2 * ry };
    }
    default: {
      const boxes = Array.from(el.children).map(bbox).filter((b) => b.width > 0 || b.height > 0);
      if (boxes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
      const x = Math.min(...boxes.map((b) => b.x));
      const y = Math.min(...boxes.map((b) => b.y));
      const r = Math.max(...boxes.map((b) => b.x + b.width));
      const bt = Math.max(...boxes.map((b) => b.y + b.height));
      return { x, y, width: r - x, height: bt - y };
    }
  }
}

// src/core/engine.ts
var SVG_NS = "http://www.w3.org/2000/svg";
var uid = 0;
var QUALITY_MARK = { good: "", uncertain: "?", bad: "\xD7", stale: "*" };
var RUN_WORDS = /* @__PURE__ */ new Set(["running", "run", "on", "open", "opened", "true", "start", "started", "marche", "ouvert", "ouverte"]);
function isRunning(v) {
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    const n = Number(s);
    return Number.isNaN(n) ? RUN_WORDS.has(s) : n !== 0;
  }
  return isTruthy(v);
}
function approach(cur, target, dt, tau) {
  if (tau <= 0) return target;
  return target + (cur - target) * Math.exp(-dt / tau);
}
var SynopticEngine = class {
  svg;
  lives = [];
  byTag = /* @__PURE__ */ new Map();
  states = /* @__PURE__ */ new Map();
  dirty = /* @__PURE__ */ new Set();
  animating = /* @__PURE__ */ new Set();
  alarmMap = /* @__PURE__ */ new Map();
  config;
  motion;
  visible = true;
  frame = 0;
  last = 0;
  defs;
  prefix = `hmi${++uid}`;
  opts;
  constructor(svg, opts = {}) {
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
  get tags() {
    return [...this.byTag.keys()].sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
  }
  get bindings() {
    return this.lives.map((l) => ({ tag: l.tag, kind: l.kind, id: l.el.getAttribute("id") ?? "" }));
  }
  /** Alarmes actives, de la plus prioritaire à la moins prioritaire, puis la plus récente d'abord. */
  get alarms() {
    return [...this.alarmMap.values()].sort((a, b) => a.priority - b.priority || b.since - a.since);
  }
  /** Nombre de liaisons en mouvement (utile pour vérifier qu'au repos rien ne tourne). */
  get activeAnimations() {
    return this.animating.size;
  }
  get(tag) {
    return this.states.get(tag);
  }
  setConfig(config) {
    this.config = config;
    for (const tag of this.byTag.keys()) if (this.states.has(tag)) this.dirty.add(tag);
    this.schedule();
  }
  set(tag, value, quality = "good") {
    const prev = this.states.get(tag);
    if (prev && prev.value === value && prev.quality === quality) return;
    this.states.set(tag, { value, quality, updated: this.now() });
    if (this.byTag.has(tag)) {
      this.dirty.add(tag);
      this.schedule();
    }
  }
  update(values, quality = "good") {
    for (const [tag, v] of Object.entries(values)) this.set(tag, v, quality);
  }
  setQuality(tag, quality) {
    const prev = this.states.get(tag);
    this.set(tag, prev?.value ?? null, quality);
  }
  /** Acquitte les alarmes d'une variable, ou toutes. */
  ack(tag) {
    for (const a of this.alarmMap.values()) {
      if (tag !== void 0 && a.tag !== tag) continue;
      if (!a.acknowledged) {
        a.acknowledged = true;
        this.emit("hmi-alarm", { ...a, active: true });
      }
    }
    for (const l of this.lives) if (l.kind === "alarm" && (tag === void 0 || l.tag === tag) && l.el.hasAttribute("data-alarm")) l.el.setAttribute("data-ack", "true");
  }
  setMotion(on) {
    if (this.motion === on) return;
    this.motion = on;
    for (const tag of this.states.keys()) if (this.byTag.has(tag)) this.dirty.add(tag);
    this.schedule();
  }
  setVisible(on) {
    this.visible = on;
    if (on) this.schedule();
  }
  /** Applique immédiatement les changements en attente (sinon : à la prochaine image). */
  flush() {
    for (const tag of this.dirty) {
      const s = this.states.get(tag);
      if (!s) continue;
      for (const l of this.byTag.get(tag) ?? []) {
        l.apply(s);
        if (s.quality === "good") l.el.removeAttribute("data-quality");
        else l.el.setAttribute("data-quality", s.quality);
        if (l.tick) this.animating.add(l);
      }
    }
    this.dirty.clear();
  }
  /** Fait avancer les animations de dt secondes (appelé par la boucle, ou à la main dans les tests). */
  step(dt) {
    this.flush();
    for (const l of this.animating) if (!l.tick?.(dt)) this.animating.delete(l);
  }
  destroy() {
    if (this.frame) {
      const cancel = this.opts.cancelFrame ?? (typeof cancelAnimationFrame !== "undefined" ? cancelAnimationFrame : void 0);
      cancel?.(this.frame);
      this.frame = 0;
    }
    for (const l of this.lives) l.dispose?.();
    this.animating.clear();
  }
  // ---- boucle -------------------------------------------------------------
  now() {
    return this.opts.now?.() ?? (typeof performance !== "undefined" ? performance.now() : Date.now());
  }
  schedule() {
    if (this.frame || !this.visible) return;
    const raf = this.opts.requestFrame ?? (typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame : void 0);
    if (!raf) return;
    this.last = 0;
    this.frame = raf((t) => this.loop(t));
  }
  loop(t) {
    this.frame = 0;
    const dt = this.last ? Math.min((t - this.last) / 1e3, 0.1) : 1 / 60;
    this.last = t;
    this.step(dt);
    if (this.visible && (this.animating.size > 0 || this.dirty.size > 0)) {
      const raf = this.opts.requestFrame ?? requestAnimationFrame;
      this.frame = raf((n) => this.loop(n));
    }
  }
  emit(type, detail) {
    this.opts.emit?.(type, detail);
  }
  // ---- liaisons -----------------------------------------------------------
  cfg(tag) {
    return this.config[tag] ?? {};
  }
  opt(el, tag, name) {
    const a = el.getAttribute(`data-hmi-${name}`);
    if (a !== null) return a;
    const c = this.cfg(tag)[name];
    if (c === void 0 || c === null) return void 0;
    if (typeof c === "object") return Object.entries(c).map(([k, v]) => `${k}:${v}`).join(",");
    return String(c);
  }
  num(el, tag, name, fallback) {
    return toNumber(this.opt(el, tag, name)) ?? fallback;
  }
  ensureDefs() {
    if (!this.defs) {
      this.defs = document.createElementNS(SVG_NS, "defs");
      this.svg.insertBefore(this.defs, this.svg.firstChild);
    }
    return this.defs;
  }
  /** Enveloppe un élément dans un <g> : les transformations ajoutées n'écrasent jamais celles du dessin. */
  wrap(el, cls) {
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", cls);
    el.parentNode?.insertBefore(g, el);
    g.appendChild(el);
    return g;
  }
  create(kind, tag, el) {
    const self = this;
    const base = { kind, tag, el };
    switch (kind) {
      case "level": {
        const dir = (el.getAttribute("data-hmi-dir") ?? "up").toLowerCase();
        const clip = document.createElementNS(SVG_NS, "clipPath");
        const id = `${this.prefix}-clip-${this.lives.length}`;
        clip.setAttribute("id", id);
        clip.setAttribute("clipPathUnits", "userSpaceOnUse");
        const rect = document.createElementNS(SVG_NS, "rect");
        clip.appendChild(rect);
        this.ensureDefs().appendChild(clip);
        const wrapper = this.wrap(el, "hmi-level");
        wrapper.setAttribute("clip-path", `url(#${id})`);
        let box;
        let shown = 0;
        let target = 0;
        const draw = (r) => {
          box = box && box.height + box.width > 0 ? box : el.hasAttribute("data-hmi-box") ? bbox(el) : bbox(wrapper);
          const { x, y, width: w, height: h } = box;
          const pad = 2;
          if (dir === "down") rect.setAttribute("y", String(y - pad));
          else if (dir === "up") rect.setAttribute("y", String(y + h * (1 - r)));
          if (dir === "left") rect.setAttribute("x", String(x + w * (1 - r)));
          else rect.setAttribute("x", String(x - pad));
          const vertical = dir === "up" || dir === "down";
          rect.setAttribute("width", String(vertical ? w + 2 * pad : w * r));
          rect.setAttribute("height", String(vertical ? h * r + (dir === "down" ? pad : 0) : h + 2 * pad));
          if (!vertical) rect.setAttribute("y", String(y - pad));
          if (dir === "right") rect.setAttribute("x", String(x));
        };
        draw(0);
        return {
          ...base,
          apply(s) {
            const n = toNumber(s.value);
            target = n === void 0 ? 0 : ratio(n, self.num(el, tag, "min", 0), self.num(el, tag, "max", 100));
            el.setAttribute("data-level", target.toFixed(3));
            if (!self.motion) {
              shown = target;
              draw(shown);
            }
          },
          tick(dt) {
            shown = approach(shown, target, dt, self.motion ? 0.25 : 0);
            if (Math.abs(shown - target) < 5e-4) shown = target;
            draw(shown);
            return shown !== target;
          }
        };
      }
      case "spin": {
        const wrapper = this.wrap(el, "hmi-spin");
        let origin;
        let angle = 0;
        let speed = 0;
        let target = 0;
        const center = () => {
          if (origin && origin.length === 2) return origin;
          const o = parseNumbers(el.getAttribute("data-hmi-origin"));
          if (o.length === 2) return origin = o;
          const b = bbox(wrapper);
          const c = [b.x + b.width / 2, b.y + b.height / 2];
          if (b.width + b.height > 0) origin = c;
          return c;
        };
        return {
          ...base,
          apply(s) {
            const when = el.getAttribute("data-hmi-when");
            const run = when ? parseCondition(when)(s.value) : isRunning(s.value);
            const max = toNumber(self.opt(el, tag, "max"));
            const n = toNumber(s.value);
            const factor = !run ? 0 : max !== void 0 && n !== void 0 && !when ? Math.max(-1, Math.min(n / max, 1)) : 1;
            target = self.num(el, tag, "speed", 0.6) * factor;
            el.setAttribute("data-spinning", String(run));
            if (!self.motion) speed = 0;
          },
          tick(dt) {
            if (!self.motion) return false;
            speed = approach(speed, target, dt, self.num(el, tag, "inertia", 0.8));
            if (Math.abs(speed - target) < 2e-3) speed = target;
            angle = (angle + speed * 360 * dt) % 360;
            const [cx, cy] = center();
            wrapper.setAttribute("transform", `rotate(${angle.toFixed(2)} ${cx} ${cy})`);
            return speed !== 0 || target !== 0;
          }
        };
      }
      case "angle": {
        const wrapper = this.wrap(el, "hmi-angle");
        let shown = Number.NaN;
        let target = 0;
        const render = () => {
          const o = parseNumbers(el.getAttribute("data-hmi-origin"));
          let [cx, cy] = o;
          if (o.length !== 2) {
            const b = bbox(wrapper);
            [cx, cy] = [b.x + b.width / 2, b.y + b.height / 2];
          }
          wrapper.setAttribute("transform", `rotate(${shown.toFixed(2)} ${cx} ${cy})`);
        };
        return {
          ...base,
          apply(s) {
            const n = toNumber(s.value) ?? 0;
            const r = ratio(n, self.num(el, tag, "min", 0), self.num(el, tag, "max", 100));
            const a0 = self.num(el, tag, "angle-min", 0);
            const a1 = self.num(el, tag, "angle-max", 90);
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
          }
        };
      }
      case "move": {
        const wrapper = this.wrap(el, "hmi-move");
        let shown = Number.NaN;
        let target = 0;
        const render = () => {
          const dir = (el.getAttribute("data-hmi-dir") ?? "up").toLowerCase();
          const d = shown;
          const [dx, dy] = dir === "up" ? [0, -d] : dir === "down" ? [0, d] : dir === "left" ? [-d, 0] : [d, 0];
          wrapper.setAttribute("transform", `translate(${dx.toFixed(2)} ${dy.toFixed(2)})`);
        };
        return {
          ...base,
          apply(s) {
            const n = toNumber(s.value);
            const r = n === void 0 ? 0 : ratio(n, self.num(el, tag, "min", 0), self.num(el, tag, "max", 100));
            target = r * self.num(el, tag, "distance", 100);
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
          }
        };
      }
      case "flow": {
        if (!el.getAttribute("stroke-dasharray") && !(el.getAttribute("style") ?? "").includes("dasharray")) el.setAttribute("stroke-dasharray", "10 10");
        const period = parseNumbers(el.getAttribute("stroke-dasharray")).reduce((a, b) => a + b, 0) || 20;
        let offset = 0;
        let speed = 0;
        let target = 0;
        return {
          ...base,
          apply(s) {
            const when = el.getAttribute("data-hmi-when");
            const max = toNumber(self.opt(el, tag, "max"));
            const n = toNumber(s.value);
            const dead = self.num(el, tag, "deadband", max !== void 0 ? Math.abs(max) * 0.01 : 0);
            const run = when ? parseCondition(when)(s.value) : n !== void 0 && typeof s.value === "number" ? Math.abs(n) > dead : isRunning(s.value);
            const factor = !run ? 0 : max !== void 0 && n !== void 0 && !when ? Math.max(-1, Math.min(n / max, 1)) : 1;
            target = self.num(el, tag, "speed", 30) * factor;
            el.setAttribute("data-flowing", String(run && factor !== 0));
            if (factor < 0) el.setAttribute("data-reverse", "true");
            else el.removeAttribute("data-reverse");
          },
          tick(dt) {
            if (!self.motion) return false;
            speed = approach(speed, target, dt, 0.4);
            if (Math.abs(speed - target) < 0.05) speed = target;
            offset = (offset - speed * dt) % period;
            el.setAttribute("stroke-dashoffset", offset.toFixed(2));
            return speed !== 0 || target !== 0;
          }
        };
      }
      case "text": {
        const spans = el.querySelectorAll("tspan");
        const target = spans.length > 0 ? spans[spans.length - 1] : el;
        return {
          ...base,
          apply(s) {
            const map = self.mapping(el, tag);
            const mapped = map?.(s.value);
            const txt = mapped ?? formatValue(s.value, self.num(el, tag, "decimals", 1), self.opt(el, tag, "unit") ?? "");
            target.textContent = s.quality === "good" ? txt : `${txt} ${QUALITY_MARK[s.quality]}`;
          }
        };
      }
      case "state": {
        return {
          ...base,
          apply(s) {
            const mapped = self.mapping(el, tag)?.(s.value);
            el.setAttribute("data-state", mapped ?? String(s.value ?? "unknown"));
          }
        };
      }
      case "visible": {
        const test = parseCondition(el.getAttribute("data-hmi-when"));
        const initial = el.style.display;
        return {
          ...base,
          apply(s) {
            el.style.display = test(s.value) ? initial : "none";
          }
        };
      }
      case "blink": {
        const test = parseCondition(el.getAttribute("data-hmi-when"));
        return {
          ...base,
          apply(s) {
            if (test(s.value)) el.setAttribute("data-blink", "true");
            else el.removeAttribute("data-blink");
          }
        };
      }
      case "fill":
      case "stroke": {
        return {
          ...base,
          apply(s) {
            const color = (parseMap(el.getAttribute("data-hmi-colors")) ?? self.mapping(el, tag))?.(s.value);
            el.style.setProperty(kind, color ?? "");
          }
        };
      }
      case "alarm":
        return this.alarmBinding(el, tag, this.lives.length);
      case "select": {
        const label = el.getAttribute("data-hmi-label") ?? this.cfg(tag).label ?? tag;
        el.setAttribute("tabindex", "0");
        el.setAttribute("role", "button");
        el.setAttribute("aria-label", label);
        el.setAttribute("focusable", "true");
        const fire = () => this.emit("hmi-select", { tag, id: el.getAttribute("id") ?? "", label });
        const onClick = () => fire();
        const onKey = (e) => {
          const k = e.key;
          if (k === "Enter" || k === " ") {
            e.preventDefault();
            fire();
          }
        };
        el.addEventListener("click", onClick);
        el.addEventListener("keydown", onKey);
        return {
          ...base,
          apply() {
          },
          dispose() {
            el.removeEventListener("click", onClick);
            el.removeEventListener("keydown", onKey);
          }
        };
      }
    }
  }
  mapping(el, tag) {
    return parseMap(this.opt(el, tag, "map"));
  }
  alarmBinding(el, tag, index) {
    const when = el.getAttribute("data-hmi-when");
    const test = when ? parseCondition(when) : void 0;
    const txt = el.querySelector(".hmi-ind-p");
    let level;
    const key = `${tag}#${index}`;
    return {
      kind: "alarm",
      tag,
      el,
      apply: (s) => {
        const lim = {
          ll: toNumber(this.opt(el, tag, "ll")),
          l: toNumber(this.opt(el, tag, "l")),
          h: toNumber(this.opt(el, tag, "h")),
          hh: toNumber(this.opt(el, tag, "hh"))
        };
        const next = test ? test(s.value) ? "on" : void 0 : alarmLevel(s.value, lim, level, this.num(el, tag, "deadband", 0));
        if (next === level) {
          const a = this.alarmMap.get(key);
          if (a) a.value = s.value;
          return;
        }
        level = next;
        if (!next) {
          el.removeAttribute("data-alarm");
          el.removeAttribute("data-priority");
          el.removeAttribute("data-ack");
          const a = this.alarmMap.get(key);
          if (a) {
            this.alarmMap.delete(key);
            this.emit("hmi-alarm", { ...a, value: s.value, active: false });
          }
          return;
        }
        const fixed = toNumber(el.getAttribute("data-hmi-priority"));
        const priority = fixed && fixed >= 1 && fixed <= 4 ? Math.trunc(fixed) : defaultPriority(next);
        el.setAttribute("data-alarm", next);
        el.setAttribute("data-priority", String(priority));
        el.setAttribute("data-ack", "false");
        if (txt) txt.textContent = String(priority);
        const alarm = {
          tag,
          level: next,
          priority,
          value: s.value,
          label: el.getAttribute("data-hmi-message") ?? this.cfg(tag).label ?? tag,
          acknowledged: false,
          since: Date.now()
        };
        this.alarmMap.set(key, alarm);
        this.emit("hmi-alarm", { ...alarm, active: true });
      }
    };
  }
};

// src/core/sanitize.ts
var FORBIDDEN = /* @__PURE__ */ new Set([
  "script",
  "foreignobject",
  "iframe",
  "object",
  "embed",
  "audio",
  "video",
  "canvas",
  "animate",
  "animatemotion",
  "animatetransform",
  "set",
  "discard",
  "handler",
  "listener",
  "meta",
  "link",
  "base"
]);
var SAFE_DATA_URL = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;
function safeRef(value) {
  const v = value.trim();
  return v.startsWith("#") || SAFE_DATA_URL.test(v);
}
function cleanCss(css) {
  return css.replace(/@import[^;]*;?/gi, "").replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (m, _q, target) => target.trim().startsWith("#") ? m : "none").replace(/expression\s*\(/gi, "(");
}
function sanitizeTree(root) {
  const report = { removedElements: 0, removedAttributes: 0 };
  const walk = (el) => {
    for (const child of Array.from(el.children)) {
      if (FORBIDDEN.has(child.localName.toLowerCase())) {
        child.remove();
        report.removedElements++;
      } else walk(child);
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const local = name.includes(":") ? name.slice(name.indexOf(":") + 1) : name;
      let drop = name.startsWith("on");
      if (!drop && (local === "href" || name === "src" || name === "action" || name === "formaction")) drop = !safeRef(attr.value);
      if (!drop && name === "style") {
        const cleaned = cleanCss(attr.value);
        if (cleaned !== attr.value) el.setAttribute("style", cleaned);
      }
      if (!drop && /url\(/i.test(attr.value) && name !== "style") drop = !/^\s*url\(\s*['"]?#/.test(attr.value);
      if (drop) {
        el.removeAttributeNode(attr);
        report.removedAttributes++;
      }
    }
    if (el.localName.toLowerCase() === "style" && el.textContent) el.textContent = cleanCss(el.textContent);
  };
  walk(root);
  return report;
}
function parseSvg(source) {
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  let root = doc.documentElement;
  if (!root || root.localName !== "svg" || doc.getElementsByTagName("parsererror").length > 0) {
    root = new DOMParser().parseFromString(source, "text/html").querySelector("svg");
    if (!root) throw new Error("le fichier fourni n\u2019est pas un SVG valide.");
  }
  const report = sanitizeTree(root);
  return { svg: root, report };
}

// src/attach.ts
function attachSynoptic(svg, options = {}) {
  if (options.sanitize) sanitizeTree(svg);
  const engine = new SynopticEngine(svg, options);
  engine.flush();
  return engine;
}

// src/theme.ts
var SYNOPTIC_CSS = `
:host, .hmi-synoptic-root {
  --_bg: var(--hmi-syn-bg, #d4d7da);
  --_fg: var(--hmi-fg, #1b1e21);
  --_muted: var(--hmi-fg-muted, #5c636a);
  --_line: var(--hmi-syn-line, #7d848b);
  --_equip: var(--hmi-syn-equip, #f3f4f5);
  --_run: var(--hmi-syn-run, #3b4148);
  --_liquid: var(--hmi-syn-liquid, #9fb3c4);
  --_flow: var(--hmi-syn-flow, #00a3cc);
  --_a1: var(--hmi-alarm-1, #d1242f);
  --_a2: var(--hmi-alarm-2, #e0a800);
  --_a3: var(--hmi-alarm-3, #8250df);
  --_a4: var(--hmi-alarm-4, #6e7781);
  --_q: var(--hmi-quality, #8250df);
  --_focus: var(--hmi-focus, #0969da);
  --_font: var(--hmi-font, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif);
  --_mono: var(--hmi-font-mono, ui-monospace, 'Cascadia Mono', Consolas, monospace);
}
:host([data-theme='dark']), [data-hmi-theme='dark'] .hmi-synoptic-root, .hmi-synoptic-root[data-hmi-theme='dark'] {
  --_bg: var(--hmi-syn-bg, #1d2125);
  --_fg: var(--hmi-fg, #e6e9ec);
  --_muted: var(--hmi-fg-muted, #98a1aa);
  --_line: var(--hmi-syn-line, #6b737b);
  --_equip: var(--hmi-syn-equip, #2a2f34);
  --_run: var(--hmi-syn-run, #c3c9cf);
  --_liquid: var(--hmi-syn-liquid, #4a6175);
  --_flow: var(--hmi-syn-flow, #2cc4ea);
  --_a1: var(--hmi-alarm-1, #ff5f57);
  --_a2: var(--hmi-alarm-2, #f2c037);
  --_a3: var(--hmi-alarm-3, #b392f0);
  --_a4: var(--hmi-alarm-4, #8b949e);
  --_q: var(--hmi-quality, #c297ff);
  --_focus: var(--hmi-focus, #4493f8);
}
:host { display: block; position: relative; color: var(--_fg); font-family: var(--_font); }
:host([hidden]) { display: none; }
svg.hmi-svg, .hmi-synoptic-root svg { display: block; width: 100%; height: auto; max-height: var(--hmi-syn-max-height, none); overflow: visible; }

/* Fond et textes du dessin */
.hmi-bg { fill: var(--_bg); }
.hmi-txt { fill: var(--_fg); font-family: var(--_font); font-size: 12px; }
.hmi-txt-muted { fill: var(--_muted); font-family: var(--_font); font-size: 12px; }
.hmi-tagname { fill: var(--_muted); font-family: var(--_mono); font-size: 10.5px; letter-spacing: .04em; }
.hmi-val { fill: var(--_fg); font-family: var(--_mono); font-size: 12.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
.hmi-unit { fill: var(--_muted); font-family: var(--_mono); font-size: 10.5px; }

/* Tuyauteries : ligne grise, flux anim\xE9 en couleur proc\xE9d\xE9 seulement quand il circule */
.hmi-pipe { fill: none; stroke: var(--_line); stroke-width: 6; stroke-linejoin: round; stroke-linecap: butt; }
.hmi-pipe-core { fill: none; stroke: var(--_bg); stroke-width: 2.5; stroke-linejoin: round; }
.hmi-flowline { fill: none; stroke: var(--_flow); stroke-width: 2.5; stroke-linejoin: round; stroke-linecap: butt; transition: opacity .4s; }
.hmi-flowline[data-flowing='false'] { opacity: 0; }
.hmi-signal { fill: none; stroke: var(--_muted); stroke-width: 1; stroke-dasharray: 5 3; }

/* \xC9quipements : contour, plein fonc\xE9 = en marche, contour seul = arr\xEAt */
.hmi-body { fill: var(--_equip); stroke: var(--_fg); stroke-width: 2; stroke-linejoin: miter; transition: fill .3s; }
.hmi-mark { fill: none; stroke: var(--_fg); stroke-width: 2; stroke-linecap: butt; stroke-linejoin: miter; transition: stroke .3s; }
.hmi-mark-fill { fill: var(--_fg); stroke: none; transition: fill .3s; }
[data-state='running'] .hmi-body, [data-state='open'] .hmi-body, [data-state='on'] .hmi-body { fill: var(--_run); }
[data-state='running'] .hmi-mark, [data-state='open'] .hmi-mark, [data-state='on'] .hmi-mark { stroke: var(--_equip); }
[data-state='running'] .hmi-mark-fill, [data-state='open'] .hmi-mark-fill, [data-state='on'] .hmi-mark-fill { fill: var(--_equip); }
[data-state='transit'] .hmi-body { fill: url(#hmi-hatch); }
[data-state='fault'] .hmi-body { stroke: var(--_a1); stroke-width: 3; }
[data-state='maintenance'] .hmi-body { stroke-dasharray: 4 3; }
[data-state='unknown'] .hmi-body, [data-quality] .hmi-body { stroke-dasharray: 2 3; }
.hmi-state-txt { fill: var(--_muted); font-family: var(--_mono); font-size: 10px; letter-spacing: .05em; text-transform: uppercase; }
[data-state='fault'] .hmi-state-txt { fill: var(--_a1); font-weight: 700; }

/* Cuves et niveaux */
.hmi-vessel { fill: var(--_equip); stroke: var(--_fg); stroke-width: 2; }
.hmi-liquid { fill: var(--_liquid); }
.hmi-scale { stroke: var(--_muted); stroke-width: 1; }
.hmi-limit { stroke: var(--_muted); stroke-width: 1.5; stroke-dasharray: 3 2; }

/* Barre analogique verticale (plage normale + curseur) */
.hmi-bar-track { fill: var(--_equip); stroke: var(--_muted); stroke-width: 1; }
.hmi-bar-normal { fill: color-mix(in srgb, var(--_muted) 28%, transparent); }
.hmi-bar-ptr { fill: var(--_fg); }
[data-alarm] > .hmi-bar-ptr, [data-alarm] .hmi-bar-ptr { fill: var(--_a2); }
[data-alarm][data-priority='1'] .hmi-bar-ptr { fill: var(--_a1); }

/* Indicateur d'alarme : forme + couleur + num\xE9ro de priorit\xE9 (jamais la couleur seule) */
.hmi-ind { display: none; }
.hmi-ind[data-alarm] { display: inline; }
.hmi-ind > .p1, .hmi-ind > .p2, .hmi-ind > .p3, .hmi-ind > .p4 { display: none; stroke: var(--_fg); stroke-width: 1; }
.hmi-ind[data-priority='1'] > .p1 { display: inline; fill: var(--_a1); }
.hmi-ind[data-priority='2'] > .p2 { display: inline; fill: var(--_a2); }
.hmi-ind[data-priority='3'] > .p3 { display: inline; fill: var(--_a3); }
.hmi-ind[data-priority='4'] > .p4 { display: inline; fill: var(--_a4); }
.hmi-ind-p { fill: #1b1e21; font: 700 10px var(--_mono); text-anchor: middle; dominant-baseline: central; }
.hmi-ind[data-priority='1'] .hmi-ind-p, .hmi-ind[data-priority='3'] .hmi-ind-p { fill: #fff; }
.hmi-ind[data-ack='false'] { animation: hmi-blink 1s steps(1, end) infinite; }
@keyframes hmi-blink { 50% { opacity: .25; } }

/* Liaisons g\xE9n\xE9riques sur un SVG libre */
[data-alarm]:not(.hmi-ind):not(g) { stroke: var(--_a2); }
[data-alarm][data-priority='1']:not(.hmi-ind):not(g) { stroke: var(--_a1); }
[data-blink='true'] { animation: hmi-blink 1s steps(1, end) infinite; }
text[data-quality] { fill: var(--_q); }
[data-quality='bad']:not(text), [data-quality='stale']:not(text) { opacity: .55; }
.hmi-qual { display: none; fill: var(--_q); font: 700 11px var(--_mono); }
[data-quality] ~ .hmi-qual, .hmi-qual[data-quality] { display: inline; }

/* Interaction */
[role='button'] { cursor: pointer; }
[role='button']:focus { outline: none; }
[role='button']:focus-visible { outline: 2px solid var(--_focus); outline-offset: 3px; }
[role='button']:hover .hmi-hit, [role='button']:focus-visible .hmi-hit { stroke: var(--_focus); stroke-opacity: .7; }
.hmi-hit { fill: transparent; stroke: transparent; stroke-width: 1.5; stroke-dasharray: 3 3; }

.hmi-flame { transform-box: fill-box; transform-origin: 50% 100%; animation: hmi-flicker 1.3s ease-in-out infinite alternate; }
@keyframes hmi-flicker { 0% { transform: scale(1, 1); } 40% { transform: scale(.94, 1.08); } 100% { transform: scale(1.04, .93); } }
:host([data-motion='off']) .hmi-flame, :host([data-motion='off']) [data-blink='true'], :host([data-motion='off']) .hmi-ind[data-ack='false'] { animation: none; }

@media (prefers-reduced-motion: reduce) {
  .hmi-flame { animation: none; }
  .hmi-ind[data-ack='false'], [data-blink='true'] { animation: none; }
  .hmi-flowline { transition: none; }
}
`;

// src/components/hmi-synoptic.ts
var SafeHTMLElement = typeof HTMLElement !== "undefined" ? HTMLElement : class {
};
var HmiSynoptic = class extends SafeHTMLElement {
  static observedAttributes = ["src", "motion", "theme", "label"];
  root;
  engine;
  pending = [];
  _config = {};
  _source;
  loadToken = 0;
  io;
  mo;
  mq;
  onMq = () => this.syncMotion();
  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${SYNOPTIC_CSS}</style><div class="hmi-host" part="canvas"></div>`;
  }
  // ---- API publique ----------------------------------------------------
  /** Écrit une variable. Les mises à jour sont regroupées et appliquées à la prochaine image. */
  set(tag, value, quality = "good") {
    if (this.engine) this.engine.set(tag, value, quality);
    else this.pending.push([tag, value, quality]);
  }
  /** Écrit plusieurs variables d'un coup : `update({ LT101: 62, P101: 'running' })`. */
  update(values, quality = "good") {
    for (const [k, v] of Object.entries(values)) this.set(k, v, quality);
  }
  setQuality(tag, quality) {
    this.set(tag, this.get(tag)?.value ?? null, quality);
  }
  get(tag) {
    return this.engine?.get(tag);
  }
  /** Acquitte les alarmes d'une variable, ou toutes. */
  ack(tag) {
    this.engine?.ack(tag);
  }
  /** Applique tout de suite les mises à jour en attente (tests, captures). */
  flush() {
    this.engine?.flush();
  }
  get tags() {
    return this.engine?.tags ?? [];
  }
  get bindings() {
    return this.engine?.bindings ?? [];
  }
  /** Diagnostic : nombre de liaisons en mouvement (0 au repos : aucune image calculée). */
  get activeAnimations() {
    return this.engine?.activeAnimations ?? 0;
  }
  get alarms() {
    return this.engine?.alarms ?? [];
  }
  /** L'élément <svg> affiché (après nettoyage). */
  get svg() {
    return this.root.querySelector("svg");
  }
  get config() {
    return this._config;
  }
  /** Métadonnées des variables : bornes, unité, décimales, seuils, correspondances. */
  set config(c) {
    this._config = c ?? {};
    this.engine?.setConfig(this._config);
  }
  get source() {
    return this._source;
  }
  /** Code SVG à afficher (chaîne). Remplace `src`. */
  set source(svg) {
    this._source = svg;
    if (svg !== void 0) this.mount(svg);
  }
  // ---- cycle de vie ----------------------------------------------------
  connectedCallback() {
    const json = this.querySelector('script[type="application/json"]');
    if (json?.textContent && Object.keys(this._config).length === 0) {
      try {
        this._config = JSON.parse(json.textContent);
      } catch {
        this.fail("configuration JSON illisible");
      }
    }
    this.syncTheme();
    this.setAttribute("data-motion", this.motionEnabled() ? "on" : "off");
    if (!this.mo && typeof MutationObserver !== "undefined") {
      this.mo = new MutationObserver(() => this.syncTheme());
      this.mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-hmi-theme"] });
    }
    if (!this.mq && typeof matchMedia !== "undefined") {
      this.mq = matchMedia("(prefers-reduced-motion: reduce)");
      this.mq.addEventListener?.("change", this.onMq);
    }
    if (!this.io && typeof IntersectionObserver !== "undefined") {
      this.io = new IntersectionObserver((entries) => this.engine?.setVisible(entries.some((e) => e.isIntersecting)));
      this.io.observe(this);
    }
    if (!this.engine) {
      if (this._source !== void 0) this.mount(this._source);
      else if (this.hasAttribute("src")) void this.load(this.getAttribute("src") ?? "");
      else {
        const tpl = this.querySelector("template");
        if (tpl) this.mount(tpl.innerHTML);
      }
    }
  }
  disconnectedCallback() {
    this.io?.disconnect();
    this.io = void 0;
    this.mo?.disconnect();
    this.mo = void 0;
    this.mq?.removeEventListener?.("change", this.onMq);
    this.mq = void 0;
  }
  attributeChangedCallback(name, old, value) {
    if (old === value) return;
    if (name === "src" && value && this.isConnected && this._source === void 0) void this.load(value);
    if (name === "motion") this.syncMotion();
    if (name === "theme") this.syncTheme();
    if (name === "label") this.svg?.setAttribute("aria-label", value ?? "");
  }
  // ---- interne -----------------------------------------------------------
  async load(url) {
    const token = ++this.loadToken;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (token === this.loadToken) this.mount(text);
    } catch (e) {
      if (token === this.loadToken) this.fail(`impossible de charger ${url} (${e.message})`);
    }
  }
  mount(source) {
    let parsed;
    try {
      parsed = parseSvg(source);
    } catch (e) {
      this.fail(e.message);
      return;
    }
    const host = this.root.querySelector(".hmi-host");
    if (!host) return;
    const previous = this.engine;
    const keep = previous ? previous.tags.map((t) => [t, previous.get(t)]) : [];
    previous?.destroy();
    const svg = document.importNode(parsed.svg, true);
    svg.classList.add("hmi-svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", this.getAttribute("label") ?? svg.querySelector("title")?.textContent ?? "Synoptique");
    host.replaceChildren(svg);
    this.engine = new SynopticEngine(svg, {
      config: this._config,
      motion: this.motionEnabled(),
      emit: (type, detail2) => this.dispatchEvent(new CustomEvent(type, { detail: detail2, bubbles: true, composed: true }))
    });
    for (const [t, s] of keep) if (s) this.engine.set(t, s.value ?? null, s.quality);
    for (const [t, v, q] of this.pending) this.engine.set(t, v, q);
    this.pending = [];
    this.engine.flush();
    const detail = { tags: this.engine.tags, bindings: this.engine.bindings, sanitized: parsed.report };
    this.dispatchEvent(new CustomEvent("hmi-load", { detail }));
  }
  fail(message) {
    const host = this.root.querySelector(".hmi-host");
    if (host) host.innerHTML = `<p role="alert" part="error" style="font:13px var(--_mono);color:var(--_a1);padding:12px;border:1px dashed currentColor">hmi-synoptic : ${message.replace(/[<>&]/g, "")}</p>`;
    this.dispatchEvent(new CustomEvent("hmi-error", { detail: { message } }));
  }
  motionEnabled() {
    const m = this.getAttribute("motion");
    if (m === "off") return false;
    if (m === "on") return true;
    return !(this.mq?.matches ?? (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches));
  }
  syncMotion() {
    const on = this.motionEnabled();
    this.setAttribute("data-motion", on ? "on" : "off");
    this.engine?.setMotion(on);
  }
  syncTheme() {
    const own = this.getAttribute("theme");
    const inherited = this.closest("[data-hmi-theme]")?.getAttribute("data-hmi-theme");
    const theme = own && own !== "auto" ? own : inherited ?? "light";
    this.setAttribute("data-theme", theme);
  }
};
function defineSynoptic(tag = "hmi-synoptic") {
  if (typeof customElements !== "undefined" && !customElements.get(tag)) customElements.define(tag, HmiSynoptic);
}
defineSynoptic();

// src/adapters.ts
function* parseMessage(data) {
  const msg = JSON.parse(data);
  if (Array.isArray(msg)) {
    for (const m of msg) if (m && typeof m.tag === "string") yield [m.tag, m.value ?? null, m.quality];
  } else if (msg && typeof msg === "object") {
    for (const [k, v] of Object.entries(msg)) yield [k, v];
  }
}
function feed(target, data, opts) {
  try {
    for (const [t, v, q] of (opts.parse ?? parseMessage)(data)) target.set(t, v, q ?? "good");
  } catch {
  }
}
function markStale(target, opts) {
  if (opts.staleOnDisconnect === false) return;
  const t = target;
  for (const tag of target.tags) target.set(tag, t.get?.(tag)?.value ?? null, "stale");
}
function connectWebSocket(target, url, opts = {}) {
  let ws;
  let closed = false;
  let connected = false;
  let delay = 1e3;
  let timer;
  const open = () => {
    ws = new WebSocket(url);
    ws.onopen = () => {
      connected = true;
      delay = 1e3;
      opts.onStatus?.(true);
    };
    ws.onmessage = (e) => feed(target, String(e.data), opts);
    ws.onclose = () => {
      if (connected) markStale(target, opts);
      connected = false;
      opts.onStatus?.(false);
      if (!closed) timer = setTimeout(open, delay);
      delay = Math.min(delay * 2, 3e4);
    };
  };
  open();
  return {
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    },
    get connected() {
      return connected;
    }
  };
}
function connectEventSource(target, url, opts = {}) {
  const es = new EventSource(url);
  let connected = false;
  es.onopen = () => {
    connected = true;
    opts.onStatus?.(true);
  };
  es.onmessage = (e) => feed(target, String(e.data), opts);
  es.onerror = () => {
    if (connected) markStale(target, opts);
    connected = false;
    opts.onStatus?.(false);
  };
  return {
    close() {
      es.close();
    },
    get connected() {
      return connected;
    }
  };
}
function poll(target, url, intervalMs = 1e3, opts = {}) {
  let connected = false;
  let stopped = false;
  let timer;
  const tick = async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      feed(target, await res.text(), opts);
      if (!connected) opts.onStatus?.(true);
      connected = true;
    } catch {
      if (connected) {
        markStale(target, opts);
        opts.onStatus?.(false);
      }
      connected = false;
    }
    if (!stopped) timer = setTimeout(() => void tick(), intervalMs);
  };
  void tick();
  return {
    close() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
    get connected() {
      return connected;
    }
  };
}
export {
  ALARM_LABELS,
  HmiSynoptic,
  KINDS,
  QUALITY_MARK,
  SYNOPTIC_CSS,
  SynopticEngine,
  alarmLevel,
  attachSynoptic,
  collectBindings,
  connectEventSource,
  connectWebSocket,
  defaultPriority,
  defineSynoptic,
  formatValue,
  isRunning,
  isTruthy,
  parseCondition,
  parseIdConvention,
  parseMap,
  parseMessage,
  parseSvg,
  poll,
  ratio,
  sanitizeTree,
  toNumber
};
