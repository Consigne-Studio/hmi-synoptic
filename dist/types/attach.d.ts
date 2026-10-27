import { SynopticEngine, type EngineOptions } from './core/engine.js';
/**
 * Lie un <svg> déjà présent dans la page (Angular, React, gabarit serveur) sans Web Component.
 * Chargez aussi dist/hmi-synoptic.css et ajoutez la classe `hmi-synoptic-root` à un parent.
 *   const m = attachSynoptic(document.querySelector('#station svg'));
 *   m.update({ LT101: 62 });
 */
export declare function attachSynoptic(svg: SVGSVGElement, options?: EngineOptions & {
    sanitize?: boolean;
}): SynopticEngine;
