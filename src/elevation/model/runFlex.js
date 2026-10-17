import { DEFAULT_SETTINGS } from './constants.js';
import { cornerAt } from './corners.js';
import { wallFrame, wallLength } from './geometry.js';
import { followLeaders } from './joints.js';
import { validateRunPlacement } from './overlap.js';
import { endMinWidthsForRun, horizontalResolution } from './runAnchors.js';
import { pinTargetsForRun } from './runPins.js';
import { runFlexNeeds } from './splitRun.js';
import { wallSideOf, wallViewForRun } from './wallSides.js';

/**
 * Run flex (SPEC-RF1, SPEC-RF2): a run grows or shrinks by up to `settings.runFlex` at each edge so
 * its auto boxes come out on the rounding setting, instead of the boxes absorbing a small change (a
 * 13/16" end panel in place of a 3/4" one).
 *
 * What can give, per run edge: a free end; a window, door, recess or soffit offset (inward always,
 * outward only into its gap); a free wall end (an island or peninsula end, outward only, shared by
 * every run anchored there on both faces and by the wall end panel); a joint, which passes the change
 * on to the joined run (it slides at its own width, or its flex filler takes it). Wall ends against
 * another wall, corners, follow edges, edges flush against another run and pinned cabinets hold.
 *
 * The room sync stores the flexed span in `run.x` / `run.width` (what everything draws) and records
 * what it did in `run.flex = { left, right, x, width, boxes? }`: how far each edge moved out (negative =
 * in), the span it wrote, and the auto box size a flex filler left (per segment: `run`, or `left` /
 * `right` beside pins). A moved joint records `joint.flex = { by, x }`; a free wall end's move is the
 * derived `wall._endFlex = { start?, end? }`. The next sync takes all of it back out first
 * (`unflexRoom`), so every run is solved from its drawn span and nothing drifts. An edge or joint
 * someone moved since keeps its new position as drawn; a run moved as a whole keeps its flex.
 */

const EPSILON = 1e-6;
const STEP = 1 / 16;
const SEARCH_LIMIT = 1;
const MAX_COMBINATIONS = 20000;
const FIXED = 'fixed';

const grid = (value) => Math.round(value / STEP) * STEP;

/** The run's drawn span: its stored span with the last sync's flex taken back out. */
export function unflexRun(run) {
  const record = run.flex;
  if (!record) return run;
  const { flex, ...rest } = run;
  void flex;
  const left = run.x;
  const right = run.x + run.width;
  const translated = Math.abs(run.width - record.width) <= EPSILON;
  const keepLeft = translated || Math.abs(left - record.x) <= EPSILON;
  const keepRight = translated || Math.abs(right - (record.x + record.width)) <= EPSILON;
  const x = left + (keepLeft ? record.left ?? 0 : 0);
  const drawnRight = right - (keepRight ? record.right ?? 0 : 0);
  return {
    ...rest,
    x,
    width: drawnRight - x,
    ...(translated && record.boxes ? { _flexBoxes: record.boxes } : {}),
  };
}

function hasFlex(wall) {
  return Object.hasOwn(wall, '_endFlex') || wall.runs.some((run) => run.flex);
}

/** Take every run's and wall end's flex back out before a sync. */
export function unflexRoom(room) {
  if (!room.walls.some(hasFlex)) return room;
  return {
    ...room,
    walls: room.walls.map((wall) => {
      if (!hasFlex(wall)) return wall;
      const { _endFlex, ...rest } = wall;
      void _endFlex;
      return { ...rest, runs: wall.runs.map(unflexRun) };
    }),
  };
}

/** How far one run edge may move out (+) or in (−) on its own, and what kind of edge it is. */
export function flexEdge(run, side, settings, tolerance) {
  const anchor = run.anchors?.[side];
  if (!anchor) return { kind: 'free', lo: -tolerance, hi: tolerance };
  const offsetEdge = (gap) => ({
    kind: 'offset',
    lo: -tolerance,
    hi: Math.min(tolerance, Math.max(0, gap)),
  });
  if (anchor.to === 'opening') {
    return offsetEdge(anchor.clearance ?? settings.casingClearance ?? DEFAULT_SETTINGS.casingClearance);
  }
  if (anchor.to === 'soffit' || anchor.to === 'recess') return offsetEdge(anchor.offset ?? 0);
  return { kind: 'hard', lo: 0, hi: 0 };
}

function followsEdge(other, run) {
  return ['left', 'right'].some((side) => (
    other.anchors?.[side]?.to === 'follow' && other.anchors[side].runId === run.id));
}

/**
 * Whether a run edge sits flush against another run on the same face that overlaps it vertically
 * without a joint: flex would open a gap there or push into it, so the edge holds.
 */
function touches(wall, run, side) {
  if (run.anchors?.[side]) return false;
  const edge = side === 'left' ? run.x : run.x + run.width;
  return wall.runs.some((other) => other.id !== run.id
    && !followsEdge(other, run)
    && wallSideOf(other) === wallSideOf(run)
    && Math.min(run.z + run.height, other.z + other.height) - Math.max(run.z, other.z) > EPSILON
    && Math.abs((side === 'left' ? other.x + other.width : other.x) - edge) <= EPSILON);
}

/**
 * The node a run edge moves with, and how its own shift (along its face, + right) reads off the
 * node's value: `shift = c × value`. Joints and free wall ends are shared nodes; a free edge or an
 * opening offset is its own node; anything that holds is the one fixed node (value 0).
 */
function edgeNode(room, wall, run, side, settings, tolerance) {
  const anchor = run.anchors?.[side];
  if (anchor === true) {
    const view = wallViewForRun(wall, run);
    if (cornerAt(room, view, side).type !== 'open') return { key: FIXED, c: 1 };
    const frame = wallFrame(room, view);
    const endpoint = side === 'left' ? frame.leftEndpoint : frame.rightEndpoint;
    return {
      key: `end:${endpoint}`,
      c: side === 'left' ? -1 : 1,
      range: [0, tolerance],
      terminal: { kind: 'free', outward: 1 },
      endpoint,
    };
  }
  if (touches(wall, run, side)) return { key: FIXED, c: 1 };
  const edge = flexEdge(run, side, settings, tolerance);
  if (edge.kind === 'hard') return { key: FIXED, c: 1 };
  return {
    key: `edge:${run.id}:${side}`,
    c: 1,
    range: side === 'left' ? [-edge.hi, -edge.lo] : [edge.lo, edge.hi],
    terminal: { kind: edge.kind, outward: side === 'left' ? -1 : 1, right: side === 'right' },
  };
}

/**
 * Node values linked by exact changes: every node reads `value = sign × root + offset` off its root,
 * and each root keeps the range its value may take.
 */
class Links {
  constructor() {
    this.links = new Map();
    this.ranges = new Map([[FIXED, [0, 0]]]);
    this.links.set(FIXED, null);
  }

  add(key, range) {
    if (this.links.has(key)) return;
    this.links.set(key, null);
    this.ranges.set(key, range ?? [-Infinity, Infinity]);
  }

  find(key) {
    let sign = 1;
    let offset = 0;
    let current = key;
    while (this.links.get(current)) {
      const link = this.links.get(current);
      offset = link.sign * offset + link.offset;
      sign *= link.sign;
      current = link.root;
    }
    return { root: current, sign, offset };
  }

  /**
   * Require `cb × b − ca × a = change`. Returns false (and changes nothing) when that can't hold with
   * the links and ranges already there.
   */
  link(a, ca, b, cb, change) {
    const A = this.find(a);
    const B = this.find(b);
    if (A.root === B.root) {
      const slope = cb * B.sign - ca * A.sign;
      const rest = change - (cb * B.offset - ca * A.offset);
      if (slope === 0) return Math.abs(rest) <= EPSILON;
      const value = grid(rest / slope);
      const [lo, hi] = this.ranges.get(A.root);
      if (Math.abs(value * slope - rest) > EPSILON || value < lo - EPSILON || value > hi + EPSILON) return false;
      this.ranges.set(A.root, [value, value]);
      return true;
    }
    // root(B) = sign × root(A) + offset
    const k = cb * B.sign;
    const sign = k * ca * A.sign;
    const offset = k * (change + ca * A.offset - cb * B.offset);
    if (B.root === FIXED) return this.link(b, cb, a, ca, -change);
    const [bLo, bHi] = this.ranges.get(B.root);
    const mapped = sign > 0 ? [bLo - offset, bHi - offset] : [offset - bHi, offset - bLo];
    const [aLo, aHi] = this.ranges.get(A.root);
    const lo = Math.max(aLo, mapped[0]);
    const hi = Math.min(aHi, mapped[1]);
    if (lo > hi + EPSILON) return false;
    this.ranges.set(A.root, [lo, hi]);
    this.links.set(B.root, { root: A.root, sign, offset });
    return true;
  }

  value(key, roots) {
    const { root, sign, offset } = this.find(key);
    return sign * (roots.get(root) ?? 0) + offset;
  }
}

/** Every value a root may take in the search, on the sixteenth grid. */
function rootValues([lo, hi]) {
  const first = Math.ceil((Math.max(lo, -SEARCH_LIMIT) - EPSILON) / STEP);
  const last = Math.floor((Math.min(hi, SEARCH_LIMIT) + EPSILON) / STEP);
  const values = [];
  for (let index = first; index <= last; index += 1) values.push(index * STEP);
  return values;
}

function compareCosts(a, b) {
  for (let index = 0; index < a.length; index += 1) {
    const difference = a[index] - b[index];
    if (Math.abs(difference) > EPSILON) return difference;
  }
  return 0;
}

function placementOk(wall, run, settings) {
  const view = wallViewForRun(wall, run);
  return validateRunPlacement({ ...view, length: wallLength(view) }, run, settings).ok;
}

/** A run's edges and needs as the solver sees them. */
function runModel(room, wall, run, settings, tolerance) {
  const { _flexBoxes: priorBoxes, ...withoutPrior } = run;
  const clean = Object.hasOwn(run, '_flexBoxes') ? withoutPrior : run;
  const nodes = {
    left: edgeNode(room, wall, clean, 'left', settings, tolerance),
    right: edgeNode(room, wall, clean, 'right', settings, tolerance),
  };
  const length = wallLength(wall);
  const opts = {
    endMinWidths: endMinWidthsForRun(room, wall, clean, settings),
    pinTargets: pinTargetsForRun(clean, wall, length, settings),
  };
  const needs = runFlexNeeds(clean, settings, opts);
  const elements = [];
  if (needs.length === 0 || clean.holdWidth === true) {
    elements.push({ a: nodes.left, b: nodes.right, candidates: [0] });
  } else {
    for (const need of needs) {
      const a = need.edges.includes('left') ? nodes.left : { key: FIXED, c: 1 };
      const b = need.edges.includes('right') ? nodes.right : { key: FIXED, c: 1 };
      const prior = priorBoxes?.[need.key];
      const raise = need.raise && Number.isFinite(prior) && prior > need.box + EPSILON
        ? need.raise(prior)
        : null;
      if (need.elastic) {
        elements.push({
          a,
          b,
          elastic: raise === null
            ? need.elastic
            : { lo: need.elastic.lo, hi: Math.max(need.elastic.hi, raise + (need.elastic.hi - need.elastic.lo)) },
          raise,
        });
      } else {
        elements.push({ a, b, candidates: [...need.candidates, 0] });
      }
    }
  }
  return { run: clean, nodes, elements, opts };
}

/** A run moved by the solved node values, with its flex record (and its filler box sizes). */
function flexedRun(model, values, settings) {
  const { run, nodes, opts } = model;
  const shift = (side) => nodes[side].c * (values.get(nodes[side].key) ?? 0);
  const left = grid(shift('left'));
  const right = grid(shift('right'));
  const moved = Math.abs(left) > EPSILON || Math.abs(right) > EPSILON;
  const next = moved ? { ...run, x: run.x + left, width: run.width - left + right } : run;
  const boxes = {};
  for (const need of runFlexNeeds(next, settings, opts)) {
    if (need.box !== null && need.box !== undefined) boxes[need.key] = need.box;
  }
  const hasBoxes = Object.keys(boxes).length > 0;
  if (!moved && !hasBoxes) return run;
  return {
    ...next,
    flex: {
      left: -left,
      right,
      x: next.x,
      width: next.width,
      ...(hasBoxes ? { boxes } : {}),
    },
  };
}

/** Group runs that move together: joined at a joint, sharing a free wall end, or one following another. */
function clusters(models) {
  const parent = new Map();
  const find = (key) => {
    while (parent.get(key) !== key) key = parent.get(key);
    return key;
  };
  const join = (a, b) => {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    parent.set(find(a), find(b));
  };
  for (const model of models) {
    const id = `run:${model.run.id}`;
    join(id, id);
    for (const side of ['left', 'right']) {
      const { key } = model.nodes[side];
      if (key !== FIXED) join(id, key);
    }
  }
  const groups = new Map();
  for (const model of models) {
    const root = find(`run:${model.run.id}`);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(model);
  }
  return [...groups.values()];
}

/**
 * Solve one cluster: link its runs' exact changes (best candidate first, a change of 0 when none
 * fits), then try every value of the free roots that keeps the flex fillers in range, cheapest first:
 * a filler keeping its box size, offsets used least (free ends go first), the edges kept even, the
 * least movement, the odd sixteenth on the right. The first that places cleanly wins; none = no flex.
 */
function solveCluster(wall, cluster, settings) {
  const links = new Links();
  const terminals = new Map();
  for (const model of cluster) {
    for (const side of ['left', 'right']) {
      const node = model.nodes[side];
      links.add(node.key, node.range);
      if (node.terminal) terminals.set(node.key, node.terminal);
    }
  }
  const elastic = [];
  for (const model of cluster) {
    for (const element of model.elements) {
      if (element.elastic) {
        elastic.push(element);
        continue;
      }
      for (const change of element.candidates) {
        if (links.link(element.a.key, element.a.c, element.b.key, element.b.c, change)) break;
      }
    }
  }

  const keys = [...links.links.keys()];
  const roots = [...new Set(keys.map((key) => links.find(key).root))].filter((root) => root !== FIXED);
  const choices = roots.map((root) => rootValues(links.ranges.get(root)));
  if (choices.some((values) => values.length === 0)) return null;
  const combinations = choices.reduce((count, values) => count * values.length, 1);
  if (combinations > MAX_COMBINATIONS) return null;

  const options = [];
  const visit = (index, assigned) => {
    if (index === roots.length) {
      const values = new Map(keys.map((key) => [key, grid(links.value(key, assigned))]));
      let missedRaises = 0;
      for (const element of elastic) {
        const change = element.b.c * values.get(element.b.key) - element.a.c * values.get(element.a.key);
        if (change < element.elastic.lo - EPSILON || change > element.elastic.hi + EPSILON) return;
        if (element.raise !== null && change < element.raise - EPSILON) missedRaises += 1;
      }
      const moves = [...terminals].map(([key, terminal]) => ({
        ...terminal,
        amount: Math.abs(values.get(key)),
      }));
      options.push({
        values,
        cost: [
          missedRaises,
          moves.filter((move) => move.kind === 'offset').reduce((sum, move) => sum + move.amount, 0),
          Math.max(0, ...moves.map((move) => move.amount)),
          moves.reduce((sum, move) => sum + move.amount, 0),
          -moves.filter((move) => move.right).reduce((sum, move) => sum + move.amount, 0),
        ],
      });
      return;
    }
    for (const value of choices[index]) {
      assigned.set(roots[index], value);
      visit(index + 1, assigned);
    }
    assigned.delete(roots[index]);
  };
  visit(0, new Map());
  options.sort((a, b) => compareCosts(a.cost, b.cost));

  for (const option of options) {
    const runs = cluster.map((model) => flexedRun(model, option.values, settings));
    const view = {
      ...wall,
      runs: wall.runs.map((run) => runs.find((candidate) => candidate.id === run.id) ?? run),
    };
    const fits = runs.every((run, index) => {
      const before = cluster[index].run;
      const grows = run.x < before.x - EPSILON || run.x + run.width > before.x + before.width + EPSILON;
      if (!grows) return true;
      const others = { ...view, runs: view.runs.filter((other) => !followsEdge(other, run)) };
      const beforeView = { ...wall, runs: wall.runs.filter((other) => !followsEdge(other, before)) };
      return !placementOk(beforeView, before, settings) || placementOk(others, run, settings);
    });
    if (fits) return { runs, values: option.values };
  }
  return null;
}

/** Clusters whose runs follow a run in another cluster go after it. */
function clusterOrder(groups) {
  const clusterOf = new Map();
  groups.forEach((group, index) => group.forEach((model) => clusterOf.set(model.run.id, index)));
  const after = groups.map((group, index) => new Set(group.flatMap((model) => followLeaders(model.run))
    .map((leaderId) => clusterOf.get(leaderId))
    .filter((leader) => leader !== undefined && leader !== index)));
  const order = [];
  const placed = new Set();
  while (order.length < groups.length) {
    const ready = groups.map((_, index) => index)
      .filter((index) => !placed.has(index) && [...after[index]].every((leader) => placed.has(leader)));
    const next = ready.length > 0 ? ready : groups.map((_, index) => index).filter((index) => !placed.has(index));
    for (const index of next) {
      placed.add(index);
      order.push(index);
    }
  }
  return order;
}

/** Flex one wall: both faces, cluster by cluster, leaders before the runs that follow them. */
function flexWall(room, wall, settings, tolerance) {
  if (wall.runs.length === 0) return wall;
  let current = wall;
  const replace = (runs) => {
    current = {
      ...current,
      runs: current.runs.map((run) => runs.find((candidate) => candidate.id === run.id) ?? run),
    };
  };
  const strip = (run) => {
    if (!Object.hasOwn(run, '_flexBoxes')) return run;
    const { _flexBoxes, ...rest } = run;
    void _flexBoxes;
    return rest;
  };
  if (!(tolerance > 0)) {
    replace(wall.runs.map(strip));
    return current;
  }

  const firstModels = wall.runs.map((run) => runModel(room, wall, run, settings, tolerance));
  const groups = clusters(firstModels);
  const moved = new Set();
  const endFlex = {};
  for (const index of clusterOrder(groups)) {
    const ids = new Set(groups[index].map((model) => model.run.id));
    // Followers re-resolve against their leaders' flexed edges first.
    const followers = current.runs.filter((run) => ids.has(run.id)
      && followLeaders(run).some((leaderId) => moved.has(leaderId)));
    if (followers.length > 0) {
      replace(followers.map((run) => {
        const horizontal = horizontalResolution(room, current, run, settings);
        return { ...run, x: horizontal.x, width: horizontal.width };
      }));
    }
    const cluster = current.runs.filter((run) => ids.has(run.id))
      .map((run) => runModel(room, current, run, settings, tolerance));
    const solved = solveCluster(current, cluster, settings);
    const runs = solved ? solved.runs : cluster.map((model) => flexedRun(model, new Map(), settings));
    replace(runs.map(strip));
    for (const run of runs) {
      const before = cluster.find((model) => model.run.id === run.id).run;
      if (Math.abs(run.x - before.x) > EPSILON || Math.abs(run.width - before.width) > EPSILON) moved.add(run.id);
    }
    if (!solved) continue;
    for (const model of cluster) {
      for (const side of ['left', 'right']) {
        const node = model.nodes[side];
        const value = grid(solved.values.get(node.key) ?? 0);
        if (Math.abs(value) <= EPSILON) continue;
        if (node.endpoint) endFlex[node.endpoint] = value;
      }
    }
  }

  const { _endFlex, ...rest } = current;
  void _endFlex;
  return {
    ...rest,
    ...(Object.keys(endFlex).length > 0 ? { _endFlex: endFlex } : {}),
  };
}

/** The last step of a room sync: flex every wall's runs (see the module comment). */
export function flexRoom(room, settings) {
  const tolerance = settings.runFlex ?? DEFAULT_SETTINGS.runFlex ?? 0;
  if (!(tolerance > 0) && !room.walls.some((wall) => wall.runs.some((run) => Object.hasOwn(run, '_flexBoxes')))) {
    return room;
  }
  return { ...room, walls: room.walls.map((wall) => flexWall(room, wall, settings, tolerance)) };
}
