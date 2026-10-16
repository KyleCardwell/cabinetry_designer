import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  BUILT_IN_PULLS, DEFAULT_SETTINGS,
  facePullPlacement, runPulls, stileFlat,
} from '../index.js';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../doorStyles.js';
import { partDetail, runDoorDetails } from '../doorDetails.js';
import { partProfileLines } from '../doorProfileLines.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const [BAR, KNOB] = BUILT_IN_PULLS;
const TAB = { id: 'tab', kind: 'tab', length: 3, height: 0.5 };
const BASE = { type: 'door', x: 10, z: 4, width: 15, height: 30, hinge: 'left' };
const UPPER = { ...BASE, x: 0, z: 54, hinge: 'right' };
const DRAWER = { type: 'drawer_front', x: 0, z: 28, width: 30, height: 6 };
const SQUARE = { slots: {}, applied: [] };

function facePart(face, { style = DEFAULT_DOOR_STYLE, design = DOOR_DESIGNS[0],
  sizes, offsets = SQUARE } = {}) {
  const detail = partDetail(style, design, face, sizes, offsets.slots.outside?.reachOut ?? 0, offsets.applied);
  return { ...face, style, construction: detail.construction, sizes: detail.sizes ?? detail,
    flat: stileFlat(offsets, detail), core: detail.core };
}

const place = (face = BASE, overrides = {}, pull = BAR, options = {}) => facePullPlacement({
  face, part: facePart(face, options), pull, pullHeight: 45, overrides,
});
const expected = (at, centers, orientation = 'vertical', warnings = []) => ({ at, orientation, centers, warnings });
const center = (x, z) => ({ x, z });

function fixture(faces, nodes = faces.map(({ type, hinge, action }) => ({ type, hinge, action }))) {
  const run = { items: nodes.map((face, i) => ({ id: `cab${i}`, kind: 'cabinet', face })) };
  const wall = { runs: [run], openings: [] };
  const room = {};
  const scene = { faceLayouts: new Map(faces.map((face, i) => [`cab${i}`, {
    box: { width: face.width }, faces: [{ path: 'r', ...face }],
  }])), drawnPieces: [], blind: { entries: [] } };
  return { room, wall, run, scene };
}

const fromRun = ({ room, wall, run, scene }, settings = DEFAULT_SETTINGS) =>
  runPulls(room, wall, run, settings, scene);

describe('HP4 step b pull placement anchors', () => {
  it('1: places a base pull with its top end on the rail flat centre', () => {
    expect(place()).toEqual(expected('top-corner', [center(23.5, 30.125)]));
  });

  it('2: places an upper pull with its bottom end on the rail flat centre', () => {
    expect(place(UPPER)).toEqual(expected('bottom-corner', [center(1.5, 57.875)]));
  });

  it('3 and 3b: places a tall pull at H, clamping to the corner spot', () => {
    const tall = { ...BASE, x: 0, width: 18, height: 50 };
    expect(place(tall)).toEqual(expected('height', [center(16.5, 45)]));
    expect(place({ ...tall, height: 44 })).toEqual(expected('height', [center(16.5, 44.125)]));
  });

  it('4: puts pair pulls on the meeting stiles and uses swing-mark ids in run order', () => {
    const left = { ...BASE, type: 'pair_door', x: 0, width: 14.875, half: 'left' };
    const right = { ...left, x: 15, half: 'right' };
    expect(place(left).centers).toEqual([center(13.375, 30.125)]);
    expect(place(right).centers).toEqual([center(16.5, 30.125)]);
    const f = fixture([left], [{ type: 'pair_door', pullOrientation: 'horizontal' }]);
    f.scene.faceLayouts.get('cab0').faces.push({ path: 'r', ...right });
    expect(fromRun(f)).toEqual({ pulls: [
      { partId: 'cab0:rleft', pieceId: 'cab0', path: 'r', half: 'left', pullId: BAR.id,
        kind: 'pull', orientation: 'horizontal', along: 4.75, across: 0.375,
        at: 'top-corner', centers: [center(11, 32.5)] },
      { partId: 'cab0:rright', pieceId: 'cab0', path: 'r', half: 'right', pullId: BAR.id,
        kind: 'pull', orientation: 'horizontal', along: 4.75, across: 0.375,
        at: 'top-corner', centers: [center(18.875, 32.5)] },
    ], warnings: [] });
  });

  it('5: places a top-hinged door on its bottom rail horizontally', () => {
    expect(place({ ...BASE, x: 0, z: 60, width: 30, height: 15, hinge: 'top' }))
      .toEqual(expected('bottom-rail', [center(15, 61.5)], 'horizontal'));
  });

  it('6: places a pullout on its top rail horizontally', () => {
    expect(place({ ...BASE, x: 0, width: 18, height: 24, hinge: undefined, action: 'pullout' }))
      .toEqual(expected('top-rail', [center(9, 26.5)], 'horizontal'));
  });

  it('7: centres drawer pulls in equal sections and uses actual short rails or standard slab rails', () => {
    expect(place(DRAWER)).toEqual(expected('center', [center(15, 31)], 'horizontal'));
    expect(place(DRAWER, { pullCount: 2 }))
      .toEqual(expected('center', [center(7.5, 31), center(22.5, 31)], 'horizontal'));
    expect(place(DRAWER, { pullAt: 'top-rail' }))
      .toEqual(expected('top-rail', [center(15, 33.03125)], 'horizontal'));
    expect(place(DRAWER, { pullAt: 'top-rail' }, BAR, { design: DOOR_DESIGNS[1] }))
      .toEqual(expected('top-rail', [center(15, 32.5)], 'horizontal'));
  });

  it('8: uses knob diameter for the corner end offset', () => {
    expect(place(BASE, {}, KNOB)).toEqual(expected('top-corner', [center(23.5, 31.875)]));
    expect(place(BASE, { pullOrientation: 'horizontal' }, KNOB)).toEqual(place(BASE, {}, KNOB));
  });

  it('9: puts tabs flush on the top or bottom edge horizontally', () => {
    expect(place(DRAWER, {}, TAB)).toEqual(expected('top-edge', [center(15, 33.75)], 'horizontal'));
    expect(place(UPPER, {}, TAB)).toEqual(expected('bottom-edge', [center(1.5, 54.25)], 'horizontal'));
    expect(place(BASE, { pullAt: 'height', pullOrientation: 'vertical' }, TAB))
      .toEqual(expected('top-edge', [center(23.5, 33.75)], 'horizontal'));
  });

  it('10: runs a horizontal corner pull inward from the stile centre', () => {
    expect(place(BASE, { pullOrientation: 'horizontal' }))
      .toEqual(expected('top-corner', [center(21.125, 32.5)], 'horizontal'));
  });

  it('11: requires a hinge side for stile positions, including sliding doors', () => {
    for (const face of [{ ...BASE, hinge: undefined }, { ...BASE, action: 'sliding' }]) {
      expect(place(face)).toEqual(expected('top-corner', [], 'vertical', ['pull-needs-hinge']));
    }
    expect(place({ ...BASE, action: 'sliding' }, { pullAt: 'center' }))
      .toEqual(expected('center', [center(17.5, 19)]));
  });

  it('12: centres on the flat remaining between outside and inside profiles', () => {
    const offsets = { slots: { outside: { reachIn: 0.25 }, inside: { reachOut: 0.375 } } };
    expect(place(BASE, {}, BAR, { offsets }))
      .toEqual(expected('top-corner', [center(23.5625, 30.1875)]));
  });

  it('13: warns once when pulls overrun their equal sections', () => {
    expect(place({ ...DRAWER, width: 10 }, { pullCount: 3 }))
      .toEqual(expected('center', [center(10 / 6, 31), center(5, 31), center(25 / 3, 31)],
        'horizontal', ['pull-too-long']));
  });

  it('14: skips false fronts without an explicit leaf pull, and places picked ones like drawers', () => {
    const f = fixture([{ ...DRAWER, type: 'false_front' }, { ...DRAWER, type: 'false_front' }],
      [{ type: 'false_front' }, { type: 'false_front', pullId: 'pull-4' }]);
    f.run.doorPullId = 'knob-1-25';
    f.run.drawerPullId = 'knob-1-25';
    expect(fromRun(f)).toEqual({ pulls: [{
      partId: 'cab1:r', pieceId: 'cab1', path: 'r', half: null, pullId: 'pull-4',
      kind: 'pull', orientation: 'horizontal', along: 4.75, across: 0.375,
      at: 'center', centers: [center(15, 31)],
    }], warnings: [] });
  });
});

describe('HP4 placement boundaries and integration', () => {
  it('reuses only fitted applied moldings for flats and leaves slab frameOut at zero', () => {
    const detail = partDetail(DEFAULT_DOOR_STYLE, DOOR_DESIGNS[0], BASE);
    const fit = { profileId: 'fitted', index: 0, offset: 0, minX: -0.75, maxX: 1,
      reachOut: 0.75, reachIn: 1, lines: [], applyLine: null };
    const rejected = { ...fit, index: 1, maxX: 100, reachOut: 2 };
    const offsets = { slots: { outside: { reachIn: 2.5 }, inside: { reachOut: 0.375 } },
      applied: [fit, rejected] };
    expect(stileFlat(offsets, detail)).toEqual({ edgeIn: 2.5, frameOut: 0.75 });
    expect(partProfileLines(offsets, detail, BASE).warnings).toContainEqual({ code: 'door-profile-too-wide', side: 'left' });
    expect(stileFlat(offsets, { construction: 'slab' })).toEqual({ edgeIn: 2.5, frameOut: 0 });
  });

  it('uses typed member widths, projecting outside cores, and standard rails for rule slabs', () => {
    expect(place(BASE, {}, BAR, { sizes: { stiles: { right: 4 }, rails: { top: 4 } } }).centers)
      .toEqual([center(23, 29.625)]);
    const offsets = { slots: { outside: { reachOut: 0.5, reachIn: 0.25 } } };
    expect(place(BASE, {}, BAR, { offsets }).centers).toEqual([center(22.875, 29.5)]);
    const short = { ...DRAWER, height: 4 };
    expect(facePart(short).construction).toBe('slab');
    expect(place(short, { pullAt: 'top-rail' }).centers).toEqual([center(15, 30.5)]);
  });

  it('covers height ties, bottom hinges, flipper/pocket actions, all positions and horizontal height clamps', () => {
    expect(place({ ...BASE, z: 15 }).at).toBe('top-corner');
    expect(place({ ...BASE, z: 45 }).at).toBe('bottom-corner');
    expect(place({ ...BASE, hinge: 'bottom' }).at).toBe('top-rail');
    for (const action of ['flipper', 'pocket']) expect(place({ ...BASE, action })).toEqual(place());
    expect(place(BASE, { pullAt: 'center' }).centers).toEqual([center(17.5, 19)]);
    expect(place(BASE, { pullAt: 'bottom-rail' }).centers).toEqual([center(17.5, 5.5)]);
    expect(place({ ...BASE, x: 0, height: 44 }, { pullAt: 'height', pullOrientation: 'horizontal' }).centers)
      .toEqual([center(11.125, 45)]);
    expect(place(UPPER, { pullOrientation: 'horizontal' }).centers).toEqual([center(3.875, 55.5)]);
  });

  it('warns once for impossible height clamps and any hardware extending past the face', () => {
    const short = { ...BASE, height: 8 };
    expect(place(short, { pullAt: 'height' }, { ...BAR, length: 10 }))
      .toEqual(expected('height', [center(23.5, 8)], 'vertical', ['pull-too-long']));
    expect(place(BASE, { pullAt: 'top-rail' }, { ...BAR, length: 10 }).warnings).toEqual(['pull-too-long']);
    expect(place(BASE, { pullAt: 'center' }, { ...KNOB, diameter: 40 }).warnings).toEqual(['pull-too-long']);
    expect(place(DRAWER, { pullCount: 4 }, { ...TAB, length: 8 }).warnings).toEqual(['pull-too-long']);
    expect(place(DRAWER, { pullCount: 4 }).centers).toEqual([3.75, 11.25, 18.75, 26.25].map((x) => center(x, 31)));
    expect(place(DRAWER, { pullOrientation: 'vertical' }).warnings).toEqual([]);
  });

  it('resolves face/cabinet/run/wall/settings picks and cabinet/settings/default heights, with scoped warnings', () => {
    const tall = { ...BASE, z: 4, height: 80 };
    const f = fixture([tall, tall, tall, tall, tall, tall], [
      { type: 'door', hinge: 'left', pullId: 'knob-1-25' },
      { type: 'door', hinge: 'left' }, { type: 'door', hinge: 'left' },
      { type: 'door', hinge: 'left' }, { type: 'door', pullId: 'missing' },
      { type: 'door', hinge: 'left', pullId: 'none' },
    ]);
    f.scene.faceLayouts.get('cab4').faces[0].hinge = undefined;
    f.run.items[0].pullHeight = 42;
    f.run.items[1].pullHeight = null;
    f.run.items[1].doorPullId = 'knob-1-25';
    f.run.doorPullId = 'pull-4';
    f.wall.doorPullId = 'knob-1-25';
    const result = fromRun(f, { ...DEFAULT_SETTINGS, pullHeight: 48 });
    expect(result.pulls.map(({ pullId, centers }) => [pullId, centers[0].z]))
      .toEqual([['knob-1-25', 42], ['knob-1-25', 48], ['pull-4', 48], ['pull-4', 48]]);
    expect(result.warnings).toEqual([
      { code: 'pull-missing', pieceId: 'cab4', path: 'r' },
      { code: 'pull-needs-hinge', pieceId: 'cab4', path: 'r' },
    ]);
    delete f.run.doorPullId;
    expect(fromRun(f).pulls[2].pullId).toBe('knob-1-25');
    delete f.wall.doorPullId;
    expect(fromRun(f).pulls[2].pullId).toBe('pull-4');
    expect(fromRun(f, { ...DEFAULT_SETTINGS, pullHeight: undefined }).pulls[2].centers[0].z).toBe(45);
    f.run.items[2].face.pullId = 'missing';
    expect(fromRun(f).pulls[2]).toMatchObject({ pullId: 'missing', kind: 'pull', along: 4.75 });
    const skipped = fixture([{ ...BASE, type: 'panel' }, { ...BASE, type: 'open' }]);
    expect(fromRun(skipped)).toEqual({ pulls: [], warnings: [] });
  });

  it('uses default scenes and details on a real grid run without mutating inputs', () => {
    const document = normalizeElevationDocument(JSON.parse(readFileSync(
      new URL('./fixtures/golden.json', import.meta.url), 'utf8')));
    const settings = { ...document.settings, doorPullId: 'pull-4', drawerPullId: 'pull-4' };
    const room = syncRoom(document.rooms.find(({ name }) => name === 'G1 Euro kitchen'), settings);
    const wall = room.walls.find(({ runs }) => runs.some(({ id }) => id === 'b822e8ac-1a44-47ca-acec-ecb93caf7b8a'));
    const run = wall.runs.find(({ id }) => id === 'b822e8ac-1a44-47ca-acec-ecb93caf7b8a');
    const before = structuredClone({ room, settings });
    const result = runPulls(room, wall, run, settings);
    expect(result.pulls.length).toBeGreaterThan(0);
    expect(result.pulls.some(({ half }) => half === 'left')).toBe(true);
    expect(result.warnings.every(({ code }) => code === 'pull-needs-hinge')).toBe(true);
    expect(runDoorDetails(room, wall, run, settings).parts.filter(({ kind }) => kind === 'face')
      .every(({ flat, core }) => flat && core)).toBe(true);
    expect({ room, settings }).toEqual(before);
  });
});
