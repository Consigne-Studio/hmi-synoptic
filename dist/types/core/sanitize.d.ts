/**
 * Nettoyage d'un SVG avant affichage. Un synoptique vient souvent d'un fichier exporté
 * (Inkscape, Figma, Illustrator, draw.io) ou d'un serveur : on le traite comme non fiable.
 * Liste blanche des références, liste noire des éléments actifs.
 */
export interface SanitizeReport {
    removedElements: number;
    removedAttributes: number;
}
/** Nettoie l'arbre en place. */
export declare function sanitizeTree(root: Element): SanitizeReport;
/** Analyse une chaîne SVG et renvoie l'élément racine nettoyé, ou lève une erreur lisible. */
export declare function parseSvg(source: string): {
    svg: SVGSVGElement;
    report: SanitizeReport;
};
