import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bandParts } from '../bandParts.js';
import { CABINET_TYPE_IDS } from '../constants.js';
import { resolveWall, syncRoom } from '../room.js';
import { runBands } from '../runBands.js';
import { runScene } from '../runScene.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(JSON.parse(readFileSync(
  new URL('./fixtures/golden.json', import.meta.url), 'utf8',
)));
const nz1 = {
  id: 'nz1', name: 'Chamfer nosing', kind: 'nosing',
  geometry: {
    units: 'in', points: { a: [0, 0], b: [0.25, 0], c: [0.5, -0.25], d: [0.5, -1.5], e: [0, -1.5] },
    loops: [{ id: 'L1', closed: true, segs: ['a', 'b', 'c', 'd', 'e'].map((from, i, ids) => ({
      type: 'line', from, to: ids[(i + 1) % ids.length],
    })) }],
  },
  drawnPoints: { elevation: ['c'] },
};
const settings = { ...document.settings, sectionProfiles: [nz1] };

function setup(props = {}, using = settings) {
  const stored = structuredClone(document.rooms[0]);
  const wall = stored.walls[0];
  const base = wall.runs.find(({ cabinetTypeId }) => cabinetTypeId === CABINET_TYPE_IDS.BASE);
  stored.profile = { ...stored.profile, nosingProfileId: 'nz1' };
  stored.walls = [{ ...wall, x1: 0, y1: 0, x2: 120, y2: 0,
    profile: {}, connections: { start: null, end: null }, openings: [], joints: [], lines: [],
    endPanels: { start: null, end: null },
    runs: [{ ...base, id: 'base', x: 30, width: 36, top: 'stone', anchors: {},
      ends: { left: { type: 'none' }, right: { type: 'none' } },
      waterfall: { left: {} }, ...props }],
  }];
  const room = syncRoom(stored, using);
  const view = resolveWall(room, room.walls[0]);
  const run = view.runs[0];
  const bands = runBands(room, view, run, using, runScene(room, view, run, using));
  const part = bandParts(room, room.walls[0], 'front', using).find(({ kind }) => kind === 'countertop');
  return { bands, part };
}

const miter = (x1, z1, x2, z2) => ({ x1, z1, x2, z2 });
const anchors = [
  {
    name: 'stone left (anchor 1)', props: {}, x: 28.5, width: 38.25,
    outline: [[28.5, 0, 0], [30, 0, 0], [30, 34.5, 0], [66.75, 34.5, 0], [66.75, 36, 0], [28.5, 36, 0]],
    lines: [miter(28.5, 36, 30, 34.5)],
  },
  {
    name: 'stone left with a typed overhang (anchor 2)', props: { topOverhang: { left: 12 } },
    x: 16.5, width: 50.25,
    outline: [[16.5, 0, 0], [18, 0, 0], [18, 34.5, 0], [66.75, 34.5, 0], [66.75, 36, 0], [16.5, 36, 0]],
    lines: [miter(16.5, 36, 18, 34.5)],
  },
  {
    name: 'wood nz1 left (anchor 3)', props: { top: 'wood' }, x: 28.5, width: 38,
    outline: [[28.5, 0, 0], [30, 0, 0], [30, 34.5, 0], [66.5, 34.5, 0],
      [66.5, 35.75, 0], [66.25, 36, 0], [28.5, 36, 0]],
    lines: [miter(28.5, 36, 30, 34.5), miter(28.75, 35.75, 66.5, 35.75), miter(28.75, 0, 28.75, 35.75)],
  },
  {
    name: 'stone both with a right overhang (anchor 4)',
    props: { waterfall: { left: {}, right: {} }, topOverhang: { right: 6 } }, x: 28.5, width: 45,
    outline: [[28.5, 0, 0], [30, 0, 0], [30, 34.5, 0], [72, 34.5, 0],
      [72, 0, 0], [73.5, 0, 0], [73.5, 36, 0], [28.5, 36, 0]],
    lines: [miter(28.5, 36, 30, 34.5), miter(73.5, 36, 72, 34.5)],
  },
];

describe('SPEC-50.10 step 505 waterfall elevation bands', () => {
  it.each(anchors)('$name', ({ props, x, width, outline, lines }) => {
    const { bands, part } = setup(props);
    expect(bands.countertop).toEqual({ x, z: 0, width, height: 36, outline, lines });
    expect(part).toEqual({ ...bands.countertop, id: 'base:countertop', kind: 'countertop',
      runId: 'base', back: 0, front: props.top === 'wood' ? 25.375 : 25.625, coversBoxEdges: false });
  });

  it('mirrors a right wood leg and clips both ends of the level line to their miters', () => {
    const right = setup({ top: 'wood', waterfall: { right: {} }, topOverhang: { front: 2, back: 1 } });
    expect(right.bands.countertop).toEqual({ x: 29.5, z: 0, width: 38, height: 36,
      outline: [[29.5, 34.5, 0], [66, 34.5, 0], [66, 0, 0], [67.5, 0, 0],
        [67.5, 36, 0], [29.75, 36, 0], [29.5, 35.75, 0]],
      lines: [miter(67.5, 36, 66, 34.5), miter(29.5, 35.75, 67.25, 35.75), miter(67.25, 0, 67.25, 35.75)],
    });
    expect(right.part).toMatchObject({ z: 0, back: -1, front: 27.375 });
    const both = setup({ top: 'wood', waterfall: { left: {}, right: {} } });
    expect(both.bands.countertop.lines).toEqual([
      miter(28.5, 36, 30, 34.5), miter(67.5, 36, 66, 34.5),
      miter(28.75, 35.75, 67.25, 35.75), miter(28.75, 0, 28.75, 35.75), miter(67.25, 0, 67.25, 35.75),
    ]);
  });

  it('draws a thin top nosing past the run end and retains the other end arcs', () => {
    const curved = structuredClone(nz1);
    curved.geometry.loops[0].segs[1] = { type: 'arc', from: 'b', to: 'c', center: [0.25, -0.25], ccw: false };
    const { bands } = setup({ top: 'wood', overrides: { countertopThickness: 0.75 } },
      { ...settings, sectionProfiles: [curved] });
    expect(bands.countertop).toEqual({ x: 29.25, z: 0, width: 37.25, height: 35.25,
      outline: [[29.25, 0, 0], [30.75, 0, 0], [30.75, 33.75, 0], [66.5, 33.75, 0],
        [66.5, 35, 0.414214], [66.25, 35.25, 0], [29.25, 35.25, 0]],
      lines: [miter(29.25, 35.25, 30.75, 33.75), miter(29.5, 35, 66.5, 35), miter(29.5, 0, 29.5, 35)],
    });
  });

  it('leaves blocked picks and non-countertops with their existing bands', () => {
    for (const props of [{ anchors: { left: { to: 'wall' } } }, { top: 'crown' }, { top: 'none' }]) {
      expect(setup(props).bands).toEqual(setup({ ...props, waterfall: undefined }).bands);
    }
  });
});
