/**
 * Доменная единица — миллиметр (мм). Рендер маппит мм → пиксели экрана.
 * CLAUDE принцип 1: `core` без UI; здесь только числа, никакого DOM.
 */

/** CSS-пикселей на миллиметр при 96 dpi (25.4 мм = 96 px). */
export const PX_PER_MM = 96 / 25.4;

export const mmToPx = (mm: number): number => mm * PX_PER_MM;
export const pxToMm = (px: number): number => px / PX_PER_MM;
