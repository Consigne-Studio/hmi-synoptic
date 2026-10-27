import type { Quality } from './core/bindings.js';
import type { Value } from './core/parse.js';

/** Ce qu'un adaptateur alimente : <hmi-synoptic>, SynopticEngine, ou votre propre objet. */
export interface SynopticTarget {
  set(tag: string, value: Value, quality?: Quality): void;
  readonly tags: string[];
}

export interface Connection {
  close(): void;
  readonly connected: boolean;
}

export interface SourceOptions {
  /** Transforme un message reçu en mises à jour. Par défaut : JSON `{ "LT101": 62 }` ou `[{ "tag", "value", "quality" }]`. */
  parse?: (data: string) => Iterable<[string, Value, Quality?]>;
  /** Marque toutes les variables « figées » quand la liaison tombe (défaut : true). */
  staleOnDisconnect?: boolean;
  onStatus?: (connected: boolean) => void;
}

/** Lecture par défaut des messages : objet plat ou liste d'objets. */
export function* parseMessage(data: string): Generator<[string, Value, Quality?]> {
  const msg: unknown = JSON.parse(data);
  if (Array.isArray(msg)) {
    for (const m of msg as { tag?: string; value?: Value; quality?: Quality }[]) if (m && typeof m.tag === 'string') yield [m.tag, m.value ?? null, m.quality];
  } else if (msg && typeof msg === 'object') {
    for (const [k, v] of Object.entries(msg as Record<string, Value>)) yield [k, v];
  }
}

function feed(target: SynopticTarget, data: string, opts: SourceOptions): void {
  try {
    for (const [t, v, q] of (opts.parse ?? parseMessage)(data)) target.set(t, v, q ?? 'good');
  } catch {
    /* message illisible : ignoré, la valeur précédente reste affichée */
  }
}

function markStale(target: SynopticTarget, opts: SourceOptions): void {
  if (opts.staleOnDisconnect === false) return;
  const t = target as SynopticTarget & { get?(tag: string): { value: Value | undefined } | undefined };
  for (const tag of target.tags) target.set(tag, t.get?.(tag)?.value ?? null, 'stale');
}

/** WebSocket avec reconnexion progressive (1 s, 2 s, 4 s… jusqu'à 30 s). */
export function connectWebSocket(target: SynopticTarget, url: string, opts: SourceOptions = {}): Connection {
  let ws: WebSocket | undefined;
  let closed = false;
  let connected = false;
  let delay = 1000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const open = () => {
    ws = new WebSocket(url);
    ws.onopen = () => {
      connected = true;
      delay = 1000;
      opts.onStatus?.(true);
    };
    ws.onmessage = (e) => feed(target, String(e.data), opts);
    ws.onclose = () => {
      if (connected) markStale(target, opts);
      connected = false;
      opts.onStatus?.(false);
      if (!closed) timer = setTimeout(open, delay);
      delay = Math.min(delay * 2, 30000);
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
    },
  };
}

/** Server-Sent Events (EventSource) : reconnexion native du navigateur. */
export function connectEventSource(target: SynopticTarget, url: string, opts: SourceOptions = {}): Connection {
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
    },
  };
}

/** Interrogation périodique d'une URL JSON (API REST, passerelle OPC UA, Node-RED…). */
export function poll(target: SynopticTarget, url: string, intervalMs = 1000, opts: SourceOptions = {}): Connection {
  let connected = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    try {
      const res = await fetch(url, { cache: 'no-store' });
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
    },
  };
}
