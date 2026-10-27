import { SynopticEngine, type EngineOptions } from './core/engine.js';
import { sanitizeTree } from './core/sanitize.js';

/**
 * Lie un <svg> déjà présent dans la page (Angular, React, gabarit serveur) sans Web Component.
 * Chargez aussi dist/hmi-synoptic.css et ajoutez la classe `hmi-synoptic-root` à un parent.
 *   const m = attachSynoptic(document.querySelector('#station svg'));
 *   m.update({ LT101: 62 });
 */
export function attachSynoptic(svg: SVGSVGElement, options: EngineOptions & { sanitize?: boolean } = {}): SynopticEngine {
  if (options.sanitize) sanitizeTree(svg);
  const engine = new SynopticEngine(svg, options);
  engine.flush();
  return engine;
}
