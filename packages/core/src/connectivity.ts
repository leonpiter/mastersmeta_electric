/**
 * Движок связности (CLAUDE принцип 2): цепи (`Net`) ВЫЧИСЛЯЮТСЯ из геометрии, не хранятся.
 *
 * Алгоритм: собрать точки соединения (концы/точки проводов + выводы символов),
 * привязать к сетке, объединить совпадающие через union-find; точки одного провода —
 * в одной цепи. Каждая компонента связности = один потенциал (`Net`).
 */
import type { Id } from "./ids";
import { snap, pointOnSegment, type Point } from "./geometry";
import type { Page } from "./model";
import { instancePins, type SymbolLibrary } from "./symbol";

/** Вывод символа, попавший в цепь. */
export interface NetPin {
  instanceId: Id;
  pinName: string;
  x: number;
  y: number;
}

/** Цепь (потенциал) — связная группа точек соединения. */
export interface Net {
  id: number;
  /** Ключи координат («x,y»), входящих в цепь. */
  coordKeys: string[];
  /** Выводы символов на этой цепи. */
  pins: NetPin[];
  /** Провода этой цепи. */
  wireIds: Id[];
}

/** Вычислить цепи листа. */
export function computeNets(page: Page, library: SymbolLibrary): Net[] {
  const step = page.gridStep;
  const key = (p: Point): string => `${snap(p.x, step)},${snap(p.y, step)}`;

  // --- union-find по ключам координат ---
  const parent = new Map<string, string>();
  const ensure = (k: string): void => {
    if (!parent.has(k)) parent.set(k, k);
  };
  const find = (k: string): string => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r)!;
    // сжатие пути
    let c = k;
    while (parent.get(c) !== r) {
      const next = parent.get(c)!;
      parent.set(c, r);
      c = next;
    }
    return r;
  };
  const union = (a: string, b: string): void => {
    ensure(a);
    ensure(b);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  // провода: все точки полилинии одного провода — одна цепь
  for (const w of page.wires) {
    if (w.points.length === 0) continue;
    const ks = w.points.map(key);
    ks.forEach(ensure);
    for (let i = 1; i < ks.length; i++) union(ks[0], ks[i]);
  }

  // выводы символов
  const pinNodes: (NetPin & { k: string })[] = [];
  for (const inst of page.instances) {
    const sym = library.get(inst.symbolId);
    if (!sym) continue;
    for (const pp of instancePins(sym, inst)) {
      const k = key(pp);
      ensure(k);
      pinNodes.push({ instanceId: inst.id, pinName: pp.name, x: pp.x, y: pp.y, k });
    }
  }

  // --- сборка компонент ---
  const rootToIdx = new Map<string, number>();
  const nets: Net[] = [];
  const netFor = (k: string): Net => {
    const r = find(k);
    let idx = rootToIdx.get(r);
    if (idx === undefined) {
      idx = nets.length;
      rootToIdx.set(r, idx);
      nets.push({ id: idx, coordKeys: [], pins: [], wireIds: [] });
    }
    return nets[idx];
  };

  for (const k of parent.keys()) netFor(k).coordKeys.push(k);
  for (const w of page.wires) {
    if (w.points.length > 0) netFor(key(w.points[0])).wireIds.push(w.id);
  }
  for (const pn of pinNodes) {
    netFor(pn.k).pins.push({ instanceId: pn.instanceId, pinName: pn.pinName, x: pn.x, y: pn.y });
  }

  return nets;
}

/** Глобальная (сквозная) цепь: локальные неты листов, объединённые общей меткой соединителей. */
export interface ProjectNet {
  id: number;
  /** Доли цепи по листам: индекс листа + id локального нета. */
  members: { pageIndex: number; localNetId: number }[];
  /** Все выводы цепи (с указанием листа). */
  pins: (NetPin & { pageIndex: number })[];
  /** Метки соединителей страниц, объединившие цепь (для номера/адресации). */
  signals: string[];
}

/**
 * Сквозная связность проекта (S29): локальные неты каждого листа + объединение нетов
 * разных листов, если на них стоят соединители страниц (`kind: "page-connector"`) с
 * одинаковой меткой `signal`. Так провод сохраняет одну цепь (и номер) через листы.
 */
export function computeProjectNets(pages: Page[], library: SymbolLibrary): ProjectNet[] {
  const local = pages.map((p) => computeNets(p, library));

  // union-find над «листовыми» нетами: узел = `${pageIndex}:${localNetId}`
  const parent = new Map<string, string>();
  const ensure = (k: string): void => {
    if (!parent.has(k)) parent.set(k, k);
  };
  const find = (k: string): string => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  const union = (a: string, b: string): void => {
    ensure(a);
    ensure(b);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  // все локальные неты — узлы (даже без соединителей)
  local.forEach((nets, pi) => nets.forEach((_, ni) => ensure(`${pi}:${ni}`)));

  // соединители: метка → узлы (локальные неты, где лежит вывод соединителя)
  const bySignal = new Map<string, string[]>();
  pages.forEach((page, pi) => {
    for (const inst of page.instances) {
      if (library.get(inst.symbolId)?.kind !== "page-connector") continue;
      const signal = inst.signal?.trim();
      if (!signal) continue;
      const localNetId = local[pi].findIndex((n) => n.pins.some((pn) => pn.instanceId === inst.id));
      if (localNetId < 0) continue;
      const node = `${pi}:${localNetId}`;
      const list = bySignal.get(signal);
      if (list) list.push(node);
      else bySignal.set(signal, [node]);
    }
  });

  // объединить неты внутри каждой метки
  for (const nodes of bySignal.values())
    for (let i = 1; i < nodes.length; i++) union(nodes[0], nodes[i]);

  // сборка глобальных нетов по корню union-find
  const rootIdx = new Map<string, number>();
  const out: ProjectNet[] = [];
  const globalOf = (node: string): ProjectNet => {
    const r = find(node);
    let idx = rootIdx.get(r);
    if (idx === undefined) {
      idx = out.length;
      rootIdx.set(r, idx);
      out.push({ id: idx, members: [], pins: [], signals: [] });
    }
    return out[idx];
  };
  local.forEach((nets, pi) =>
    nets.forEach((net, ni) => {
      const g = globalOf(`${pi}:${ni}`);
      g.members.push({ pageIndex: pi, localNetId: ni });
      for (const pn of net.pins) g.pins.push({ ...pn, pageIndex: pi });
    }),
  );
  for (const [signal, nodes] of bySignal) {
    const g = globalOf(nodes[0]);
    if (!g.signals.includes(signal)) g.signals.push(signal);
  }
  return out;
}

/** Выводы символов, не подключённые ни к одному проводу (висящие). */
export function danglingPins(page: Page, library: SymbolLibrary): NetPin[] {
  return computeNets(page, library)
    .filter((n) => n.wireIds.length === 0)
    .flatMap((n) => n.pins);
}

/**
 * Точки-узлы (жирные точки соединения): где сходятся ≥3 «концов» проводов —
 * Т-ответвление или схождение трёх проводов. Простое пересечение без вершины
 * (две линии крест-накрест) узлом НЕ считается.
 */
export function computeJunctions(page: Page): Point[] {
  const step = page.gridStep;
  const key = (p: Point): string => `${snap(p.x, step)},${snap(p.y, step)}`;
  const deg = new Map<string, { x: number; y: number; d: number }>();
  const bump = (p: Point, by: number): void => {
    const k = key(p);
    const e = deg.get(k) ?? { x: snap(p.x, step), y: snap(p.y, step), d: 0 };
    e.d += by;
    deg.set(k, e);
  };

  // степень вершин: конец полилинии = 1, угол (внутренняя вершина) = 2
  for (const w of page.wires) {
    if (w.points.length < 2) continue;
    w.points.forEach((p, i) => bump(p, i === 0 || i === w.points.length - 1 ? 1 : 2));
  }

  // конец одного провода на середине другого (Т) → сквозной провод добавляет 2
  for (const w of page.wires) {
    if (w.points.length < 2) continue;
    const ends = [w.points[0], w.points[w.points.length - 1]];
    for (const e of ends) {
      for (const o of page.wires) {
        if (o === w || o.points.length < 2) continue;
        let hit = false;
        for (let s = 1; s < o.points.length && !hit; s++) {
          if (pointOnSegment(e, o.points[s - 1], o.points[s])) hit = true;
        }
        if (hit) {
          bump(e, 2);
          break;
        }
      }
    }
  }

  return [...deg.values()].filter((v) => v.d >= 3).map((v) => ({ x: v.x, y: v.y }));
}
