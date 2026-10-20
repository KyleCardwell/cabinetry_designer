import { afterEach, describe, expect, it, vi } from 'vitest';
import { newAccessory } from '../accessories.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { elevationParts } from '../elevationParts.js';
import { runFaceLayouts } from '../faceLayouts.js';
import { gridFromItems } from '../grid.js';
import { glassMarks, wallShowThrough } from '../index.js';
import { resolveWall } from '../room.js';
import { rolloutSpacerSides, wallRollouts } from '../rollouts.js';
import { BUILT_IN_SLIDES } from '../slides.js';
import * as detailsModule from '../doorDetails.js';
import * as shelvesModule from '../shelves.js';
import * as sceneModule from '../runScene.js';

const settings = { ...DEFAULT_SETTINGS, slides: BUILT_IN_SLIDES, drawerSlideId: 'blum-562h' };
const face = (type = 'door', extra = {}) => ({ type, size: null, ...extra });
const stack = (...children) => ({ direction: 'vertical', size: null, children });

function roomWith(leaves, { width = 24 * leaves.length, height = 30.5, depth = 24,
  cabinetTypeId = CABINET_TYPE_IDS.BASE } = {}) {
  const run = { id: 'run', cabinetTypeId, x: 24, width, z: 4, height, depth,
    ends: { left: { type: 'none' }, right: { type: 'none' } }, autoCount: false, maxCabinetWidth: null,
    heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
    grid: gridFromItems('run', leaves.map((leaf) => ({ kind: 'cabinet', width: null, ...leaf }))) };
  const wall = { id: 'wall', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5, flipped: false,
    connections: { start: null, end: null }, profile: {}, runs: [run], openings: [] };
  return { id: 'room', profile: { ...DEFAULT_SETTINGS.defaultProfile }, walls: [wall], wallOrder: ['wall'] };
}

const rect = ({ x, z, width, height }) => ({ x, z, width, height });
const show = (room, effective = settings, side = 'front') => wallShowThrough(room, room.walls[0], side, effective);
const single = (patch = {}) => roomWith([{ id: 'a', face: face('open'), ...patch }]);
const item = (entry, key) => entry.items.find((item) => item.key === key);
const keys = (entry) => entry.items.map(({ key }) => key);
const closeRect = (actual, expected) => {
  for (const [key, value] of Object.entries(expected)) expect(actual[key], key).toBeCloseTo(value, 5);
};
const openItems = [
  { key: 'edge:left', kind: 'edge', x: 24.75, z: 4, width: 0, height: 30.5 },
  { key: 'edge:right', kind: 'edge', x: 47.25, z: 4, width: 0, height: 30.5 },
  { key: 'edge:bottom', kind: 'edge', x: 24.75, z: 4.75, width: 22.5, height: 0 },
  { key: 'edge:top', kind: 'edge', x: 24.75, z: 33.75, width: 22.5, height: 0 },
  { key: 'shelf:r:0', kind: 'shelf', x: 24.8125, z: 18.875, width: 22.375, height: 0.75 },
];
const rod = { ...newAccessory([], 'FR'), name: 'Fixed rod',
  size: { width: 'section', height: 1.25, depth: 1.25 }, lengthDeduction: 0.25,
  effects: [{ kind: 'line_bore_row' }] };
const hook = { ...newAccessory([], 'HK'), name: 'Robe hook', size: { width: 3, height: 2, depth: 3 } };

afterEach(() => vi.restoreAllMocks());

describe('IN14 show-through model', () => {
  it('anchor 3: omits a standard door and skips door details and interior resolution', () => {
    const details = vi.spyOn(detailsModule, 'runDoorDetails');
    const interiors = vi.spyOn(shelvesModule, 'wallInteriorData');
    expect(show(single({ face: face('door') }))).toEqual(new Map());
    expect(details).not.toHaveBeenCalled();
    expect(interiors).not.toHaveBeenCalled();
  });

  it('anchor 4: clips the open face to the cabinet box and retains exactly the four edges and shelf', () => {
    const room = single();
    const before = structuredClone(room);
    const entry = show(room).get('a');
    const wall = resolveWall(room, room.walls[0], 'front');
    const open = runFaceLayouts(room, wall, wall.runs[0], settings).get('a').faces[0];
    const box = elevationParts(room, room.walls[0], 'front', settings).find(({ id }) => id === 'a');
    expect(entry).toMatchObject({ itemId: 'a', runId: 'run', glass: [] });
    expect(entry.windows).toEqual([{ x: Math.max(open.x, box.x), z: Math.max(open.z, box.z),
      width: Math.min(open.x + open.width, box.x + box.width) - Math.max(open.x, box.x),
      height: Math.min(open.z + open.height, box.z + box.height) - Math.max(open.z, box.z) }]);
    expect(entry.items).toEqual(openItems);
    expect(room).toEqual(before);
  });

  it('anchor 5: keeps the bottom open section and whole side edges, excluding the top section', () => {
    const room = single({ face: stack(face('door'), face('open')) });
    const entry = show(room).get('a');
    expect(entry.windows).toHaveLength(1);
    expect(keys(entry)).toEqual(['edge:left', 'edge:right', 'edge:bottom', 'divider:r:0']);
    closeRect(item(entry, 'edge:left'), rect(openItems[0]));
    expect(entry.items.every(({ kind }) => kind !== 'shelf')).toBe(true);
    const layout = runFaceLayouts(room, room.walls[0], room.walls[0].runs[0], settings).get('a');
    expect(entry.windows[0]).toEqual(rect(layout.faces.find(({ type }) => type === 'open')));
  });

  it('anchor 6: uses the framed glass openings and marks, keeping only overlapping interior items', () => {
    const room = single({ face: face('door', { panelMaterial: 'glass' }) });
    const entry = show(room).get('a');
    const detail = detailsModule.runDoorDetails(room, room.walls[0], room.walls[0].runs[0], settings)
      .parts.find(({ key }) => key === 'a:r');
    expect(entry.windows).toEqual(detail.openings);
    expect(entry.glass).toEqual([{ partId: 'a:r', openings: detail.openings,
      marks: detail.openings.flatMap(glassMarks) }]);
    // Kyle confirmed §1 takes precedence: the frame hides all four box edges.
    expect(entry.items).toEqual([openItems[4]]);
  });

  it('anchor 7: gives each pair half its elevation part id, window and three marks', () => {
    const room = single({ face: face('pair_door', { panelMaterial: 'glass' }) });
    const entry = show(room).get('a');
    expect(entry.windows).toHaveLength(2);
    expect(entry.glass.map(({ partId }) => partId)).toEqual(['a:rleft', 'a:rright']);
    const parts = elevationParts(room, room.walls[0], 'front', settings);
    for (const glass of entry.glass) {
      expect(parts.some(({ id }) => id === glass.partId)).toBe(true);
      expect(glass.openings).toHaveLength(1);
      expect(glass.marks).toHaveLength(3);
    }
    expect(new Set(keys(entry)).size).toBe(entry.items.length);
  });

  it('anchor 8: omits glass that resolves to a slab, including the short-face cutoff', () => {
    for (const teamDoorStyle of [
      { ...DEFAULT_DOOR_STYLE, designId: 'slab' },
      { ...DEFAULT_DOOR_STYLE, shortFace: { ...DEFAULT_DOOR_STYLE.shortFace, slabBelow: 40 } },
    ]) {
      expect(show(single({ face: face('door', { panelMaterial: 'glass' }) }),
        { ...settings, teamDoorStyle })).toEqual(new Map());
    }
  });

  it('anchor 9: draws the shoe front and the raised adjustable shelf at the anchored positions', () => {
    const entry = show(single({ interior: { shelves: { shoe: 1 } } })).get('a');
    closeRect(item(entry, 'shoe:r:0'), { x: 24.8125, z: 4.75, width: 22.375, height: 1.467221 });
    expect(item(entry, 'shoe:r:0').kind).toBe('shoe');
    expect(item(entry, 'shoe:r:0')).not.toHaveProperty('label');
    expect(item(entry, 'shelf:r:0').z).toBeCloseTo(19.641756, 5);
  });

  it('anchor 10: includes the placed rod and its label, omits the unplaced hook, and leaves shelves alone', () => {
    const entry = show(single({ interior: { accessories: [
      { accessoryId: 'FR', fromBottom: 20 }, { accessoryId: 'HK' },
    ] } }), { ...settings, accessories: [rod, hook] }).get('a');
    closeRect(item(entry, 'accessory:r:0'), { x: 24.75, z: 24.125, width: 22.5, height: 1.25 });
    expect(item(entry, 'accessory:r:0')).toMatchObject({ kind: 'accessory', label: 'Fixed rod' });
    expect(item(entry, 'accessory:r:1')).toBeUndefined();
    expect(item(entry, 'shelf:r:0')).toEqual(openItems[4]);
  });

  it('anchor 11: includes the roll-out box as resolved, with no spacers behind an open face', () => {
    const room = single({ interior: { rollouts: { count: 1 } } });
    const entry = show(room).get('a');
    const box = wallRollouts(room, room.walls[0], 'front', settings).get('a').get('r').rollouts[0];
    expect(entry.items.filter(({ kind }) => kind === 'rollout')).toEqual([
      { key: 'rollout:r:0', kind: 'rollout', ...rect(box) },
    ]);
    expect(entry.items.some(({ kind }) => kind === 'spacer')).toBe(false);
  });

  it('anchor 12: resolves interior data once and omits a neighboring opaque cabinet', () => {
    const room = roomWith([{ id: 'a', face: face('open') }, { id: 'b', face: face('pair_door') }], { width: 84 });
    const interiors = vi.spyOn(shelvesModule, 'wallInteriorData');
    const details = vi.spyOn(detailsModule, 'runDoorDetails');
    expect([...show(room).keys()]).toEqual(['a']);
    expect(interiors).toHaveBeenCalledTimes(1);
    expect(details).not.toHaveBeenCalled();
  });
});

describe('show-through visibility and shared drawing rules', () => {
  it('clips an oversized open face to the elevation box rather than the clear interior', () => {
    const room = single();
    const scene = sceneModule.runScene(room, room.walls[0], room.walls[0].runs[0], settings);
    scene.faceLayouts.get('a').faces = [{ type: 'open', path: 'r', x: 20, z: 0, width: 32, height: 40 }];
    vi.spyOn(sceneModule, 'runScene').mockReturnValueOnce(scene);
    expect(show(room).get('a').windows).toEqual([{ x: 24, z: 4, width: 24, height: 30.5 }]);
  });

  it('keeps every divider kind and adds center joints in both directions for double dividers', () => {
    for (const kind of ['fixed', 'double_fixed', 'stretcher', 'partition', 'double_partition']) {
      const vertical = kind.includes('partition');
      const room = single({ interior: { direction: vertical ? 'horizontal' : 'vertical',
        dividers: [{ kind }], children: [{}, {}] } });
      const divider = shelvesModule.wallInteriorData(room, room.walls[0], 'front', settings)
        .interiors.get('a').dividers[0];
      const entry = show(room).get('a');
      expect(item(entry, 'divider:r:0')).toEqual({ key: 'divider:r:0', kind: 'divider', ...rect(divider) });
      const joint = item(entry, 'divider-joint:r:0');
      if (!kind.startsWith('double_')) expect(joint).toBeUndefined();
      else if (vertical) {
        expect(joint).toMatchObject({ kind: 'edge', x: 36, z: 4.75, width: 0, height: 29 });
      } else {
        expect(joint).toMatchObject({ kind: 'edge', x: 24.75, z: 19.25, width: 22.5, height: 0 });
      }
      expect(new Set(keys(entry)).size).toBe(entry.items.length);
    }
  });

  it('keeps nosing height and placed unsized accessory lines with quantity labels, omitting drawer boxes', () => {
    const tray = { ...newAccessory([], 'TR'), name: 'Tray' };
    const room = single({ face: stack(face('drawer_front', { size: 5.875 }), face('open')),
      interior: { accessories: [{ accessoryId: 'TR', qty: 3, fromBottom: 10 }] },
      shelves: { nosing: { height: 1.5, thickness: 0.75 } } });
    const effective = { ...settings, accessories: [tray] };
    const data = shelvesModule.wallInteriorData(room, room.walls[0], 'front', effective);
    expect(data.boxes.get('a').boxes.length).toBeGreaterThan(0);
    const entry = show(room, effective).get('a');
    expect(item(entry, 'accessory:r:0')).toEqual({ key: 'accessory:r:0', kind: 'accessory',
      x: 24.75, z: 14.75, width: 22.5, height: 0, label: '3 × Tray' });
    expect(item(entry, 'shelf:r:0').height).toBe(1.5);
    expect(entry.items.some(({ kind }) => kind === 'drawer_box')).toBe(false);
  });

  it('uses strict area overlap and inclusive line coordinates with the specified tolerance', () => {
    const room = single();
    const data = shelvesModule.wallInteriorData(room, room.walls[0], 'front', settings);
    const window = show(room).get('a').windows[0];
    const { x, z, width } = window;
    data.interiors.get('a').partLines = [
      { part: 'touching', x: x - 1, z: z + 1, width: 1, height: 1 },
      { part: 'tiny-overlap', x: x - 1 + 0.5e-6, z: z + 1, width: 1, height: 1 },
      { part: 'overlap', x: x - 1 + 2e-6, z: z + 1, width: 1, height: 1 },
      { part: 'boundary', x, z: z - 2, width: 0, height: 4 },
      { part: 'within-tolerance', x: x - 0.5e-6, z: z + 1, width: 0, height: 1 },
      { part: 'outside-tolerance', x: x - 2e-6, z: z + 1, width: 0, height: 1 },
      { part: 'horizontal', x: x - 2, z, width: width + 4, height: 0 },
      { part: 'above', x, z: z + window.height + 2e-6, width, height: 0 },
    ];
    vi.spyOn(shelvesModule, 'wallInteriorData').mockReturnValue(data);
    const entry = show(room).get('a');
    expect(keys(entry).filter((key) => key.startsWith('edge:'))).toEqual([
      'edge:overlap', 'edge:boundary', 'edge:within-tolerance', 'edge:horizontal',
    ]);
    expect(item(entry, 'edge:horizontal').width).toBe(width + 4);
  });

  it('shares spacer dedupe by column and width and uses the doors-off spacer rectangles', () => {
    const room = single({ face: face('door', { hinge: 'left' }), interior: { rollouts: { count: 2 } } });
    const data = shelvesModule.wallInteriorData(room, room.walls[0], 'front', settings);
    const rollout = data.rollouts.get('a').get('r');
    const [first, second] = rollout.rollouts;
    expect(rolloutSpacerSides(rollout, first)).toEqual(['left']);
    expect(rolloutSpacerSides(rollout, second)).toEqual([]);
    expect(rolloutSpacerSides(rollout, { ...second, column: { ...second.column, x: 30 } })).toEqual(['left']);
    expect(rolloutSpacerSides(rollout, { ...second, spacers: { left: 0.5, right: 1 } })).toEqual(['left', 'right']);
    vi.spyOn(shelvesModule, 'wallInteriorData').mockReturnValue(data);
    const entry = show(single()).get('a');
    expect(entry.items.filter(({ kind }) => kind === 'spacer')).toEqual([
      { key: 'spacer:r:0:left', kind: 'spacer', x: 24.75, z: rollout.zone.z,
        width: 1.25, height: rollout.top - rollout.zone.z },
    ]);
    expect(entry.items.filter(({ kind }) => kind === 'rollout')).toHaveLength(2);
  });

  it('resolves only the selected wall face and calls door details once for a run with panel materials', () => {
    const room = roomWith([
      { id: 'a', face: face('door', { panelMaterial: 'glass' }) },
      { id: 'b', face: face('door', { panelMaterial: 'glass' }) },
    ]);
    const back = structuredClone(room.walls[0].runs[0]);
    back.id = 'back';
    back.wallSide = 'back';
    back.grid = gridFromItems('back', [{ id: 'c', kind: 'cabinet', width: null, face: face('open') }]);
    room.walls[0].runs.push(back);
    const before = structuredClone(room);
    const details = vi.spyOn(detailsModule, 'runDoorDetails');
    expect([...show(room).keys()]).toEqual(['a', 'b']);
    expect(details).toHaveBeenCalledTimes(1);
    expect([...show(room, settings, 'back').keys()]).toEqual(['c']);
    expect(details).toHaveBeenCalledTimes(1);
    expect(room).toEqual(before);
  });
});
