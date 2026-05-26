/** Геометрия в миллиметрах. */

export interface Point {
  /** мм */
  x: number;
  /** мм */
  y: number;
}

/** Привязать значение к ближайшему узлу сетки с шагом `step`. */
export const snap = (value: number, step: number): number => Math.round(value / step) * step;

/** Привязать точку к сетке по обеим осям. */
export const snapPoint = (p: Point, step: number): Point => ({
  x: snap(p.x, step),
  y: snap(p.y, step),
});

export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
