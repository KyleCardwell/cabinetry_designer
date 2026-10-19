import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { runFaceLayouts } from '../faceLayouts.js';
import { FACE_PRESETS } from '../facePresets.js';
import { resolveWall } from '../room.js';

function roomWith(run, style) {
  const wall = {
    id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [],
  };
  return {
    id: 'room-1', name: 'Room 1', profile: { ...DEFAULT_SETTINGS.defaultProfile }, walls: [wall], wallOrder: ['wall-1'],
    ...(style ? { style } : {}),
  };
}

const RUN = {
  id: 'run-1', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 24, width: 19.5, z: 4, height: 30.5, depth: 24,
  ends: { left: { type: 'end_panel', width: null }, right: { type: 'end_panel', width: null } },
  autoCount: false, maxCabinetWidth: null, items: [{ id: 'a', kind: 'cabinet', width: 18 }],
  heightMode: 'auto', overrides: {}, anchors: { left: false, right: false },
};

const STACKED = {
  id: 'run-2', cabinetTypeId: CABINET_TYPE_IDS.TALL, x: 24, width: 19.5, z: 4, height: 90, depth: 24,
  ends: { left: { type: 'end_panel', width: null }, right: { type: 'end_panel', width: null } },
  autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
  anchors: { left: false, right: false },
  grid: {
    id: 'run-2:grid', cols: [{ id: 's:col', size: 18, sizeMode: 'manual' }],
    rows: [{ id: 'run-2:row', size: null, sizeMode: 'auto' }],
    cells: [{ col: 0, row: 0, colSpan: 1, rowSpan: 1, node: {
      id: 's', cols: [{ id: 's:c', size: null, sizeMode: 'auto' }],
      rows: [{ id: 's:r0', size: null, sizeMode: 'auto' }, { id: 's:r1', size: 30, sizeMode: 'manual' }],
      cells: [
        { col: 0, row: 0, colSpan: 1, rowSpan: 1, node: { id: 't', kind: 'cabinet' } },
        { col: 0, row: 1, colSpan: 1, rowSpan: 1, node: { id: 'b', kind: 'cabinet' } },
      ],
    } }],
  },
};

describe('IN7.3 matched base drawer banks', () => {
  const face = { direction: 'vertical', size: null, children: [
    { type: 'door', size: null },
    { direction: 'vertical', size: null, match: 'base', children: [
      { type: 'drawer_front', size: 5.875 }, { type: 'drawer_front', size: 5.875 },
      { type: 'drawer_front', size: null }, { type: 'drawer_front', size: null },
    ] },
  ] };
  const tall = () => ({ ...RUN, cabinetTypeId: CABINET_TYPE_IDS.TALL, height: 90,
    items: [{ id: 'a', kind: 'cabinet', width: 18, face }] });
  const bank = (layout) => layout.faces.filter((front) => front.path.startsWith('r.1.'));
  const height = (rects) => Math.max(...rects.map((rect) => rect.z + rect.height)) - Math.min(...rects.map((rect) => rect.z));

  it('anchor 1: Euro tall resolves 30 1/8 and fronts 5 7/8, 5 7/8, 9, 9 without changing storage', () => {
    const run = tall();
    const room = roomWith(run);
    const before = structuredClone(room);
    const layout = runFaceLayouts(room, resolveWall(room, room.walls[0]), run, DEFAULT_SETTINGS).get('a');
    expect(height(bank(layout))).toBe(30.125);
    expect(bank(layout).map((front) => front.height)).toEqual([5.875, 5.875, 9, 9]);
    expect(height(layout.openings.filter((opening) => opening.path.startsWith('r.1.')))).toBe(30.125);
    expect(room).toEqual(before);
  });

  it('anchor 2: face frame tall uses a 27 1/2 bank and inset slots', () => {
    const run = tall();
    const room = roomWith(run, { cabinetStyleId: 14 });
    const layout = runFaceLayouts(room, resolveWall(room, room.walls[0]), run, DEFAULT_SETTINGS).get('a');
    expect(height(bank(layout))).toBe(27.5);
    expect(bank(layout).map((front) => front.height)).toEqual([5.875, 5.875, 5.625, 5.625]);
    expect(height(layout.openings.filter((opening) => opening.path.startsWith('r.1.')))).toBe(27.5);
  });

  it('anchor 3: inherits base box height from settings, room, then wall', () => {
    for (const level of ['settings', 'room', 'wall']) {
      const run = tall();
      const room = roomWith(run);
      room.profile = {};
      const wall = room.walls[0];
      const settings = { ...DEFAULT_SETTINGS, defaultProfile: { ...DEFAULT_SETTINGS.defaultProfile, baseBoxHeight: 31 } };
      if (level !== 'settings') room.profile.baseBoxHeight = 32;
      if (level === 'wall') wall.profile.baseBoxHeight = 33;
      const layout = runFaceLayouts(room, resolveWall(room, wall), run, settings).get('a');
      expect(height(bank(layout))).toBe(level === 'settings' ? 30.625 : level === 'room' ? 31.625 : 32.625);
    }
  });

  it('uses the matched cabinet style and stone standard even beside a wood-top base', () => {
    for (const [roomStyle, runStyle, itemStyle, expected] of [
      [14, 13, undefined, 30.125], [13, 14, 13, 30.125], [13, 13, 14, 27.5],
    ]) {
      const run = { ...tall(), style: { cabinetStyleId: runStyle } };
      run.items = [{ ...run.items[0], ...(itemStyle ? { style: { cabinetStyleId: itemStyle } } : {}) }];
      const room = roomWith(run, { cabinetStyleId: roomStyle });
      room.walls[0].runs.push({ ...RUN, id: 'base', x: 60, top: 'wood' });
      const layout = runFaceLayouts(room, resolveWall(room, room.walls[0]), run, DEFAULT_SETTINGS).get('a');
      expect(height(bank(layout))).toBe(expected);
    }
  });

  const mismatchWarnings = (room, run) => runFaceLayouts(room, resolveWall(room, room.walls[0]), run, DEFAULT_SETTINGS)
    .get('a').warnings.filter(({ code }) => code === 'drawer-stack-base-mismatch');
  const base = (overrides = {}) => ({ ...RUN, id: 'base', x: 60, top: 'wood',
    items: [{ id: 'b', kind: 'cabinet', width: 18, face: {
      direction: 'vertical', size: null, children: structuredClone(face.children[1].children),
    } }], ...overrides });

  it('compares resolved front bounds, includes false fronts and gaps, and uses a strict 1/32 threshold', () => {
    for (const [extra, expected] of [[0, false], [1 / 32, false], [-1 / 32, false],
      [1 / 32 + 1 / 1024, true], [1 / 8, true], [-1 / 8, true]]) {
      const run = tall();
      const room = roomWith(run);
      const neighbor = base({ top: 'stone', height: 30.5 + extra });
      neighbor.items[0].face.children = neighbor.items[0].face.children.map((child, index) => ({
        ...child, type: index === 0 ? 'false_front' : child.type,
      }));
      room.walls[0].runs.push(neighbor);
      const before = structuredClone(room);
      const warnings = mismatchWarnings(room, run);
      expect(warnings.length > 0).toBe(expected);
      if (expected) expect(warnings).toEqual([{
        code: 'drawer-stack-base-mismatch', path: 'r.1', baseHeight: 30.125 + extra, matchedHeight: 30.125,
      }]);
      expect(room).toEqual(before);
    }
  });

  it('ignores opposite-wall-face bases, other cabinet types, non-top banks, and unmatched groups', () => {
    const run = tall();
    const room = roomWith(run);
    const belowDoor = base({ id: 'below-door' });
    belowDoor.items[0].face = { direction: 'vertical', size: null, children: [
      { type: 'door', size: null }, ...belowDoor.items[0].face.children,
    ] };
    room.walls[0].runs.push(base({ wallSide: 'back' }), base({ id: 'upper', cabinetTypeId: CABINET_TYPE_IDS.UPPER }), belowDoor);
    expect(mismatchWarnings(room, run)).toEqual([]);
    room.walls[0].runs.push(base({ id: 'same-face' }));
    expect(mismatchWarnings(room, run)).toHaveLength(1);
    run.items[0].face = structuredClone(face);
    delete run.items[0].face.children[1].match;
    expect(mismatchWarnings(room, run)).toEqual([]);
  });

  it('uses the matched cabinet own style and detects a face-frame base bank', () => {
    const run = { ...tall(), style: { cabinetStyleId: 14 } };
    const room = roomWith(run);
    const neighbor = base({ top: 'stone', style: { cabinetStyleId: 14 }, height: 32 });
    room.walls[0].runs.push(neighbor);
    const warnings = mismatchWarnings(room, run);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].matchedHeight).toBe(27.5);
    const resolved = runFaceLayouts(room, resolveWall(room, room.walls[0]), neighbor, DEFAULT_SETTINGS).get('b');
    expect(warnings[0].baseHeight).toBe(height(resolved.faces));
    expect(warnings[0].baseHeight).toBeGreaterThan(27.5);
  });
});

describe('runFaceLayouts', () => {
  it('HP1 b anchor 8: no-end Euro cabinets hinge toward the wall, then the nearer run end', () => {
    for (const x of [0, 100]) {
      for (const anchor of [true, { to: 'wall' }]) {
        const run = {
          ...RUN, x, width: 36,
          items: [{ id: 'a', kind: 'cabinet', width: null }, { id: 'b', kind: 'cabinet', width: null }],
          ends: { left: { type: 'none' }, right: { type: 'none' } },
          anchors: { left: anchor, right: false },
        };
        const room = roomWith(run);
        const layouts = [...runFaceLayouts(room, resolveWall(room, room.walls[0]), run, DEFAULT_SETTINGS).values()];
        expect(layouts).toHaveLength(2);
        expect(layouts.map(({ box }) => [box.x, box.width])).toEqual([[x, 18], [x + 18, 18]]);
        expect(layouts.map(({ faces }) => faces[0])).toMatchObject([
          { x: x + 0.0625, width: 17.875, hinge: 'left', hingeRule: true },
          { x: x + 18.0625, width: 17.875, hinge: 'right', hingeRule: true },
        ]);
      }
    }
  });

  it('recognizes only wall anchors at a cabinet edge, with either anchor representation', () => {
    for (const anchor of [true, { to: 'wall' }, false, { to: 'opening', openingId: 'o' }, undefined]) {
      const run = {
        ...RUN, x: 100, width: 18,
        ends: { left: { type: 'none' }, right: { type: 'none' } },
        anchors: anchor === undefined ? undefined : { left: false, right: anchor },
      };
      const room = roomWith(run);
      const layouts = runFaceLayouts(room, resolveWall(room, room.walls[0]), run, DEFAULT_SETTINGS);
      expect(layouts.get('a').faces[0]).toMatchObject({
        hinge: anchor === true || anchor?.to === 'wall' ? 'right' : 'left', hingeRule: true,
      });
    }
  });

  it('49. captured single door, then the room switched to inset', () => {
    const room = roomWith(RUN);
    const wall = resolveWall(room, room.walls[0]);
    const euro = runFaceLayouts(room, wall, RUN, DEFAULT_SETTINGS).get('a');
    expect(euro.style.cabinetStyleId).toBe(13);
    expect(euro.reveals.sources.top).toBe('rule:stone-top');
    expect(euro.reveals.sources.left).toBe('rule:captured-single');
    expect(euro.faces).toEqual([{ path: 'r', type: 'door', x: 24.90625, z: 4.125, width: 17.8125, height: 30.125, hinge: 'right', hingeRule: true }]);

    const insetRoom = roomWith(RUN, { cabinetStyleId: 14 });
    const inset = runFaceLayouts(insetRoom, resolveWall(insetRoom, insetRoom.walls[0]), RUN, DEFAULT_SETTINGS).get('a');
    expect(inset.faces).toEqual([{ path: 'r', type: 'door', x: 25.5625, z: 5.5, width: 16.5, height: 27.5, hinge: 'right', hingeRule: true }]);
  });

  it('50. stacked cells get seam reveals, European and inset', () => {
    const room = roomWith(STACKED);
    const wall = resolveWall(room, room.walls[0]);
    const euro = runFaceLayouts(room, wall, STACKED, DEFAULT_SETTINGS);
    const b = euro.get('b');
    expect(b.reveals.sources.top).toBe('rule:stacked-seam');
    expect(b.reveals.sources.left).toBe('rule:captured-single');
    expect(b.faces).toEqual([{ path: 'r', type: 'door', x: 24.90625, z: 4.125, width: 17.8125, height: 29.75, hinge: 'right', hingeRule: true }]);
    const t = euro.get('t');
    expect(t.reveals.values.bottom).toBe(0);
    expect(t.faces).toEqual([{ path: 'r', type: 'door', x: 24.90625, z: 34, width: 17.8125, height: 59.875, hinge: 'right', hingeRule: true }]);
    expect(euro.has('s')).toBe(false);

    const insetRoom = roomWith(STACKED, { cabinetStyleId: 14 });
    const inset = runFaceLayouts(insetRoom, resolveWall(insetRoom, insetRoom.walls[0]), STACKED, DEFAULT_SETTINGS);
    expect(inset.get('b').faces).toEqual([{ path: 'r', type: 'door', x: 25.5625, z: 5.5, width: 16.5, height: 27.75, hinge: 'right', hingeRule: true }]);
    expect(inset.get('t').faces).toEqual([{ path: 'r', type: 'door', x: 25.5625, z: 34.75, width: 16.5, height: 57.75, hinge: 'right', hingeRule: true }]);
  });

  it('51. a cabinet between panel cells is captured', () => {
    const panel = (id) => ({ id, kind: 'panel' });
    const cell = (col, row, node) => ({ col, row, colSpan: 1, rowSpan: 1, node });
    const WRAPPED = {
      ...RUN, id: 'run-3', width: 18, items: undefined,
      ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
      grid: {
        id: 'run-3:grid', cols: [{ id: 'w:col', size: 18, sizeMode: 'manual' }],
        rows: [{ id: 'run-3:row', size: null, sizeMode: 'auto' }],
        cells: [cell(0, 0, {
          id: 'w',
          cols: [{ id: 'w:l', size: 0.75, sizeMode: 'manual' }, { id: 'w:m', size: null, sizeMode: 'auto' },
            { id: 'w:r', size: 0.75, sizeMode: 'manual' }],
          rows: [{ id: 'w:row', size: null, sizeMode: 'auto' }],
          cells: [
            cell(0, 0, panel('L')),
            cell(1, 0, {
              id: 'm', cols: [{ id: 'm:c', size: null, sizeMode: 'auto' }],
              rows: [{ id: 'm:t', size: 0.75, sizeMode: 'manual' }, { id: 'm:b', size: null, sizeMode: 'auto' }],
              cells: [cell(0, 0, panel('T')), cell(0, 1, { id: 'c', kind: 'cabinet' })],
            }),
            cell(2, 0, panel('R')),
          ],
        })],
      },
    };
    const room = roomWith(WRAPPED);
    const layouts = runFaceLayouts(room, resolveWall(room, room.walls[0]), WRAPPED, DEFAULT_SETTINGS);
    expect([...layouts.keys()]).toEqual(['c']);
    const c = layouts.get('c');
    expect(c.reveals.sources.left).toBe('rule:captured-single');
    expect(c.reveals.sources.right).toBe('rule:captured-single');
    expect(c.reveals.values.top).toBe(0.125);
    expect(c.reveals.sources.top).toBe('style');
    expect(c.faces).toEqual([{ path: 'r', type: 'door', x: 24.84375, z: 4.125, width: 16.3125, height: 29.5, hinge: 'left', hingeRule: true }]);
  });

  it('52. top-level side panels capture a cabinet; a back panel does not', () => {
    const PANELS = {
      ...RUN, id: 'run-4',
      ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
      items: [
        { id: 'L', kind: 'panel', width: 0.75 },
        { id: 'a', kind: 'cabinet', width: 18 },
        { id: 'R', kind: 'panel', width: 0.75 },
      ],
    };
    const room = roomWith(PANELS);
    const a = runFaceLayouts(room, resolveWall(room, room.walls[0]), PANELS, DEFAULT_SETTINGS).get('a');
    expect(a.reveals.sources.left).toBe('rule:captured-single');
    expect(a.reveals.sources.right).toBe('rule:captured-single');
    expect(a.faces).toEqual([{ path: 'r', type: 'door', x: 24.84375, z: 4.125, width: 17.8125, height: 30.125, hinge: 'left', hingeRule: true }]);

    const BACK = { ...PANELS, items: [PANELS.items[0], PANELS.items[1], { id: 'R', kind: 'panel', width: 0.75, depth: 0.5 }] };
    const backRoom = roomWith(BACK);
    const b = runFaceLayouts(backRoom, resolveWall(backRoom, backRoom.walls[0]), BACK, DEFAULT_SETTINGS).get('a');
    expect(b.reveals.sources.left).toBe('style');
    expect(b.reveals.sources.right).toBe('style');
  });

  const COVER = {
    ...RUN, id: 'run-5',
    ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
    items: [
      { id: 'L', kind: 'panel', width: 0.75, doors: 'cover' },
      { id: 'a', kind: 'cabinet', width: 18 },
      { id: 'R', kind: 'panel', width: 0.75 },
    ],
  };
  const layoutOf = (run) => {
    const room = roomWith(run);
    return runFaceLayouts(room, resolveWall(room, room.walls[0]), run, DEFAULT_SETTINGS).get('a');
  };

  it('53. a covered side panel pulls the door over it and sets the hinge the other way', () => {
    const a = layoutOf(COVER);
    expect(a.reveals.values.left).toBe(-0.6875);
    expect(a.reveals.sources.left).toBe('rule:covered-panel');
    expect(a.reveals.sources.right).toBe('style');
    expect(a.faces).toEqual([{
      path: 'r', type: 'door', x: 24.0625, z: 4.125, width: 18.625, height: 30.125,
      hinge: 'right', hingeRule: true,
    }]);
    expect(a.warnings).toEqual([]);
  });

  it('54. warns for a pair door or a hinge on the covered side', () => {
    const withFace = (face) => ({ ...COVER, items: [COVER.items[0], { ...COVER.items[1], face }, COVER.items[2]] });
    const pair = layoutOf(withFace({ type: 'pair_door', size: null }));
    expect(pair.reveals.sources.left).toBe('style');
    expect(pair.warnings).toContainEqual({ code: 'pair-door-covers-panel', path: 'r' });
    const hinged = layoutOf(withFace({ type: 'door', size: null, hinge: 'left' }));
    expect(hinged.faces).toEqual([{
      path: 'r', type: 'door', x: 24.0625, z: 4.125, width: 18.625, height: 30.125, hinge: 'left',
    }]);
    expect(hinged.warnings).toEqual([{ code: 'hinge-on-covered-side', path: 'r' }]);
  });
});

describe('IN7.2 a smaller top reveal grows the standard drawer fronts', () => {
  const drawer = (size = null) => ({ type: 'drawer_front', size });
  const standard = () => ({ ...drawer(), match: 'standard' });
  const heights = (face, top) => {
    const run = { ...RUN, ...(top ? { top } : {}), items: [{ id: 'a', kind: 'cabinet', width: 18, face }] };
    const room = roomWith(run);
    return runFaceLayouts(room, resolveWall(room, room.walls[0]), run, DEFAULT_SETTINGS).get('a').faces
      .map(({ height }) => height);
  };

  it('4-drawer: the two standard fronts split the 1/8; the bottom fronts stay 9', () => {
    const face = { direction: 'vertical', size: null, children: [standard(), standard(), drawer(), drawer()] };
    expect(heights(face)).toEqual([5.875, 5.875, 9, 9]);
    expect(heights(face, 'wood')).toEqual([5.9375, 5.9375, 9, 9]);
  });

  it('3-drawer: the one standard front grows to 6', () => {
    const face = { direction: 'vertical', size: null, children: [standard(), drawer(), drawer()] };
    expect(heights(face)).toEqual([5.875, 12, 12]);
    expect(heights(face, 'wood')).toEqual([6, 12, 12]);
  });

  it('a side-by-side row at the standard height grows as one; the doors below give it up', () => {
    const face = { direction: 'vertical', size: null, children: [
      { direction: 'horizontal', size: null, match: 'standard', children: [drawer(), drawer()] },
      { type: 'pair_door', size: null },
    ] };
    expect(heights(face)).toEqual([5.875, 5.875, 24.125, 24.125]);
    expect(heights(face, 'wood')).toEqual([6, 6, 24.125, 24.125]);
    // Widths in a row are never grown; a group with another typed height keeps its fronts.
    const row = { direction: 'vertical', size: null, children: [
      { direction: 'horizontal', size: null, match: 'standard', children: [drawer(5.875), drawer()] },
      { direction: 'vertical', size: 20, children: [standard(), { type: 'door', size: null }] },
      { type: 'door', size: null },
    ] };
    const grown = heights(row, 'wood');
    expect(grown.slice(0, 2)).toEqual([6, 6]);
    expect(grown[2]).toBe(5.875);
  });
});

describe('IN7.4 standard face sizes', () => {
  const preset = (key) => FACE_PRESETS.find((entry) => entry.key === key).face;
  const layoutOf = (face, { top = 'stone', style, type = CABINET_TYPE_IDS.BASE, settings = DEFAULT_SETTINGS } = {}) => {
    const run = { ...RUN, cabinetTypeId: type, top,
      ...(type !== CABINET_TYPE_IDS.BASE ? { height: 90 } : {}),
      items: [{ id: 'a', kind: 'cabinet', width: 18, face }] };
    const room = roomWith(run, style);
    const before = structuredClone(room);
    const layout = runFaceLayouts(room, resolveWall(room, room.walls[0]), run, settings).get('a');
    expect(room).toEqual(before);
    return layout;
  };

  it.each([
    ['4df', 'stone', [5.875, 5.875, 9, 9]],
    ['4df', 'wood', [5.9375, 5.9375, 9, 9]],
    ['3df', 'wood', [6, 12, 12]],
  ])('anchors 1–3: %s with %s top', (key, top, expected) => {
    expect(layoutOf(preset(key), { top }).faces.map(({ height }) => height)).toEqual(expected);
  });

  it('anchor 4: typed 5 7/8 fronts never grow', () => {
    const face = structuredClone(preset('4df'));
    face.children = face.children.map((child, index) => index < 2 ? { type: 'drawer_front', size: 5.875 } : child);
    expect(layoutOf(face, { top: 'wood' }).faces.map(({ height }) => height))
      .toEqual([5.875, 5.875, 9.0625, 9.0625]);
  });

  it('distributes manual reveal growth in 1/16 steps from the top and leaves typed fronts alone', () => {
    const face = { direction: 'vertical', size: null, children: [
      { type: 'false_front', size: null, match: 'standard' },
      { type: 'drawer_front', size: null, match: 'standard' },
      { type: 'drawer_front', size: null, match: 'standard' },
      { type: 'drawer_front', size: 5.875 }, { type: 'drawer_front', size: null },
    ] };
    for (const [top, expected] of [[0.0625, [5.9375, 5.9375, 5.9375, 5.875]],
      [0.125, [5.9375, 5.9375, 5.875, 5.875]], [0.21875, [5.875, 5.875, 5.875, 5.875]]]) {
      const run = { ...RUN, items: [{ id: 'a', kind: 'cabinet', width: 18, face, reveals: { top } }] };
      const room = roomWith(run);
      const layout = runFaceLayouts(room, resolveWall(room, room.walls[0]), run, DEFAULT_SETTINGS).get('a');
      expect(layout.faces.slice(0, 4).map(({ height }) => height)).toEqual(expected);
    }
  });

  it('anchor 5: face frame standard slots are 5, with no wood-top growth', () => {
    for (const top of ['stone', 'wood']) {
      const layout = layoutOf(preset('4df'), { top, style: { cabinetStyleId: 14 } });
      expect(layout.layoutFace.children.slice(0, 2).map(({ size }) => size)).toEqual([5, 5]);
    }
  });

  it('anchor 9: tall D/4Df stores a base match and standard fronts, resolving a 30 1/8 bank', () => {
    const face = preset('d_4df');
    expect(face.children[1]).toMatchObject({ size: null, match: 'base' });
    expect(face.children[1].children.slice(0, 2)).toEqual([
      { type: 'drawer_front', size: null, match: 'standard' },
      { type: 'drawer_front', size: null, match: 'standard' },
    ]);
    const layout = layoutOf(face, { type: CABINET_TYPE_IDS.TALL, top: 'wood' });
    expect(layout.layoutFace.children[1].size).toBe(30.125);
    expect(layout.faces.filter(({ path }) => path.startsWith('r.1.')).map(({ height }) => height))
      .toEqual([5.875, 5.875, 9, 9]);
  });

  it('resolves standard false fronts in uppers and talls without growth and follows custom settings', () => {
    const face = { direction: 'vertical', size: null, children: [
      { type: 'false_front', size: null, match: 'standard' }, { type: 'door', size: null },
    ] };
    for (const type of [CABINET_TYPE_IDS.UPPER, CABINET_TYPE_IDS.TALL]) {
      expect(layoutOf(face, { type, top: 'wood' }).faces[0].height).toBe(5.875);
    }
    const settings = { ...DEFAULT_SETTINGS, standardDrawerHeights: { european: 6.25, faceFrame: 5.5 } };
    expect(layoutOf(face, { settings }).faces[0].height).toBe(6.25);
    expect(layoutOf(face, { settings, style: { cabinetStyleId: 14 } }).layoutFace.children[0].size).toBe(5.5);
  });
});
