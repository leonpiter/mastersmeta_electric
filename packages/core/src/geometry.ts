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

/** Лежит ли точка `p` строго внутри отрезка `a–b` (не на его концах). */
export function pointOnSegment(p: Point, a: Point, b: Point, eps = 0.05): boolean {
  const atEnd = (q: Point): boolean => Math.abs(p.x - q.x) < eps && Math.abs(p.y - q.y) < eps;
  if (atEnd(a) || atEnd(b)) return false;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return false;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  if (t <= 0 || t >= 1) return false;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)) < eps;
}
