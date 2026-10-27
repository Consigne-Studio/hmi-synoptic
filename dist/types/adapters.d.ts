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
export declare function parseMessage(data: string): Generator<[string, Value, Quality?]>;
/** WebSocket avec reconnexion progressive (1 s, 2 s, 4 s… jusqu'à 30 s). */
export declare function connectWebSocket(target: SynopticTarget, url: string, opts?: SourceOptions): Connection;
/** Server-Sent Events (EventSource) : reconnexion native du navigateur. */
export declare function connectEventSource(target: SynopticTarget, url: string, opts?: SourceOptions): Connection;
/** Interrogation périodique d'une URL JSON (API REST, passerelle OPC UA, Node-RED…). */
export declare function poll(target: SynopticTarget, url: string, intervalMs?: number, opts?: SourceOptions): Connection;
