/** Boîte englobante tolérante : getBBox en navigateur, attributs sinon (tests, SSR, élément masqué). */
export interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}
/** Lit « x y w h » ou « x y ». */
export declare function parseNumbers(raw: string | null | undefined): number[];
export declare function bbox(el: Element): Box;
