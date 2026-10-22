import { describe, expect, it } from 'vitest';
import { notchedFrameRoom, notchedFrameSettings } from '../../elevation/model/__tests__/fixtures/notchedFrame.js';
import { findLeaf } from '../../elevation/model/cellTree.js';
import { frameMembers, regionOpenings } from '../../elevation/model/frames.js';
import { resolveWall, syncRoom } from '../../elevation/model/room.js';
import { runScene } from '../../elevation/model/runScene.js';
import { frameMemberRoles, frameNotes, frameNotchNotes, frameReasons, frameStandards } from '../frameNotes.js';
import { shippingList } from '../shippingList.js';

const REGION_D = { id: 'frame:d', x: 0, z: 0, width: 30, height: 30, cabinetIds: ['a'] };
const OPENINGS_D = [
  { path: 'r.0', x: 1.5, z: 22.5, width: 27, height: 6 },
  { path: 'r.1.0', x: 1.5, z: 1.5, width: 12.75, height: 19.5 },
  { path: 'r.1.1', x: 15.75, z: 1.5, width: 12.75, height: 19.5 },
];

describe('RP2.4 step a frame member roles', () => {
  it('labels the drawer and paired-door frame in member order (A1)', () => {
    const members = frameMembers(REGION_D, OPENINGS_D);
    const before = structuredClone(members);
    const result = frameMemberRoles(REGION_D, members, [{ id: 'a', x: 0, z: 0, width: 30, height: 30 }]);
    expect(result).toEqual(members.map((member, index) => ({
      ...member,
      role: ['left-stile', 'right-stile', 'bottom-rail', 'mid-rail', 'top-rail', 'mullion'][index],
      sitsOn: ['a'],
    })));
    expect(result[3].z).toBe(21);
    expect(members).toEqual(before);
  });

  it('places a seam stile on both side-by-side boxes (A2)', () => {
    const member = { kind: 'stile', x: 14.25, z: 0, width: 1.5, height: 30 };
    expect(frameMemberRoles({ ...REGION_D, cabinetIds: ['a', 'b'] }, [member], [
      { id: 'b', x: 15, z: 0, width: 15, height: 30 },
      { id: 'a', x: 0, z: 0, width: 15, height: 30 },
    ])).toEqual([{ ...member, role: 'stile', sitsOn: ['a', 'b'] }]);
  });

  it('places an interior rail on both stacked boxes (A3)', () => {
    const member = { kind: 'rail', x: 1.5, z: 14.25, width: 27, height: 1.5 };
    expect(frameMemberRoles({ ...REGION_D, cabinetIds: ['a', 'b'] }, [member], [
      { id: 'b', x: 0, z: 15, width: 30, height: 15 },
      { id: 'a', x: 0, z: 0, width: 30, height: 15 },
    ])).toEqual([{ ...member, role: 'rail', sitsOn: ['a', 'b'] }]);
  });

  it('uses the dropped region bottom to identify an upper bottom rail (A4)', () => {
    const member = { kind: 'rail', x: 1.5, z: -0.75, width: 27, height: 1.75 };
    expect(frameMemberRoles({ ...REGION_D, z: -0.75, height: 30.75 }, [member], [
      { id: 'a', x: 0, z: 0, width: 30, height: 30 },
    ])).toEqual([{ ...member, role: 'bottom-rail', sitsOn: ['a'] }]);
  });

  it('requires overlap greater than 1e-6 in both axes and region membership', () => {
    const member = { kind: 'rail', x: 0, z: 10, width: 30, height: 1.5 };
    const boxes = [
      { id: 'a', x: 0, z: 0, width: 30, height: 30 },
      { id: 'outside-region', x: 0, z: 0, width: 30, height: 30 },
      { id: 'touch-x', x: -1, z: 0, width: 1, height: 30 },
      { id: 'touch-z', x: 0, z: 11.5, width: 30, height: 1 },
      { id: 'tiny-x', x: 0, z: 0, width: 1e-6, height: 30 },
      { id: 'tiny-z', x: 0, z: 11.5 - 0.5e-6, width: 30, height: 1 },
    ];
    const region = { ...REGION_D, cabinetIds: ['a', 'touch-x', 'touch-z', 'tiny-x', 'tiny-z'] };
    expect(frameMemberRoles(region, [member], boxes)).toEqual([{ ...member, role: 'mid-rail', sitsOn: ['a'] }]);
  });

  it('orders overlapping boxes left-to-right, then bottom-to-top without sorting the input', () => {
    const member = { kind: 'rail', x: 0, z: 14.25, width: 30, height: 1.5 };
    const boxes = [
      { id: 'right-bottom', x: 15, z: 0, width: 15, height: 15 },
      { id: 'left-top', x: 0, z: 15, width: 15, height: 15 },
      { id: 'right-top', x: 15, z: 15, width: 15, height: 15 },
      { id: 'left-bottom', x: 0, z: 0, width: 15, height: 15 },
    ];
    const before = structuredClone(boxes);
    const region = { ...REGION_D, cabinetIds: boxes.map((box) => box.id) };
    expect(frameMemberRoles(region, [member], boxes)[0].sitsOn)
      .toEqual(['left-bottom', 'left-top', 'right-bottom', 'right-top']);
    expect(boxes).toEqual(before);
  });
});

describe('RP2.4 step a shop frame standards', () => {
  it('uses 1.5 inches for every flat default member (S1)', () => {
    expect(frameStandards({}, 0)).toEqual({
      'left-stile': 1.5, 'right-stile': 1.5, 'top-rail': 1.5, 'bottom-rail': 1.5,
      stile: 1.5, rail: 1.5, 'mid-rail': 1.5, mullion: 1.5,
    });
  });

  it('includes a quarter-inch bead once outside and twice inside (S2)', () => {
    expect(frameStandards({}, 0.25)).toEqual({
      'left-stile': 1.75, 'right-stile': 1.75, 'top-rail': 1.75, 'bottom-rail': 1.75,
      stile: 2, rail: 2, 'mid-rail': 2, mullion: 2,
    });
  });

  it('merges a custom stile standard over the defaults (S3)', () => {
    expect(frameStandards({ stile: 1 }, 0)).toEqual({
      'left-stile': 2, 'right-stile': 2, 'top-rail': 1.5, 'bottom-rail': 1.5,
      stile: 2, rail: 1.5, 'mid-rail': 1.5, mullion: 1.5,
    });
  });

  it('uses each configured member width and a non-default bead', () => {
    const frame = { stile: 1, rail: 2.25, midRail: 1.75, mullion: 2.5 };
    expect(frameStandards(frame, 0.375)).toEqual({
      'left-stile': 2.375, 'right-stile': 2.375, 'top-rail': 2.625, 'bottom-rail': 2.625,
      stile: 2.75, rail: 3, 'mid-rail': 2.5, mullion: 3.25,
    });
    expect(frame).toEqual({ stile: 1, rail: 2.25, midRail: 1.75, mullion: 2.5 });
  });
});

const FLAT = frameStandards({}, 0);
const BEADED = frameStandards({}, 0.25);
const BEADED_LINE = 'beaded face frame - 1 3/4" outer stiles & rails, 2" interior stiles & rails';
const numberOf = (id) => ({ a: 3, b: 4, c: 5 }[id] ?? null);
const isStile = (role) => ['left-stile', 'right-stile', 'stile', 'mullion'].includes(role);
const noteMember = (role, width, sitsOn, reason) => ({
  kind: isStile(role) ? (role === 'mullion' ? 'mullion' : 'stile') : 'rail',
  role, width: isStile(role) ? width : 27, height: isStile(role) ? 30 : width,
  sitsOn, ...(reason ? { reason } : {}),
});
const noteFrame = (standards = FLAT) => [
  noteMember('left-stile', standards['left-stile'], ['a']),
  noteMember('right-stile', standards['right-stile'], ['b']),
  noteMember('top-rail', standards['top-rail'], ['a']),
  noteMember('top-rail', standards['top-rail'], ['b']),
  noteMember('bottom-rail', standards['bottom-rail'], ['a']),
  noteMember('bottom-rail', standards['bottom-rail'], ['b']),
  noteMember('stile', standards.stile, ['a', 'b']),
];
const changeWidths = (members, select, width) => members.map((member) => (
  select(member) ? { ...member, [isStile(member.role) ? 'width' : 'height']: width } : member
));
const changeRole = (members, role, width) => changeWidths(members, (member) => member.role === role, width);

describe('ST5 step b overlap rail reasons', () => {
  it.each([
    ['plain inset', 14, 0, '2 1/2" top rail @ #2 (stone overlap)', 'RV\'s (2 1/2" T)'],
    ['beaded inset', 15, 0.25, '2 3/4" top rail @ #2 (stone overlap)', 'RV\'s (2 3/4" T)'],
  ])('prints the %s anchor', (_case, cabinetStyleId, bead, expected, reveal) => {
    const room = notchedFrameRoom({});
    const run = room.walls[0].runs[0];
    run.style = { cabinetStyleId, beadWidth: bead };
    run._frame.bead = bead;
    if (bead) delete run.seamGap;
    run.top = 'stone';
    run.topSegments = [{ id: 's', from: 'B', to: 'B', kind: 'stone', drop: 1, mode: 'overlap' }];
    const synced = syncRoom(room, notchedFrameSettings);
    const before = structuredClone(synced);
    const rows = shippingList(synced, notchedFrameSettings).rows;
    expect(rows.filter(({ key }) => ['A', 'B', 'C'].includes(key)).map(({ key, number }) => [key, number]))
      .toEqual([['A', 1], ['B', 2], ['C', 3]]);
    expect(rows.find(({ kind }) => kind === 'frame').notes).toContain(expected);
    const reveals = (key) => rows.find((row) => row.key === key).notes.filter((note) => note.startsWith("RV's"));
    expect([reveals('A'), reveals('B'), reveals('C')]).toEqual([[], [reveal], []]);
    expect(synced).toEqual(before);
  });

  it('uses the active segment kind and root column for nested cabinets', () => {
    const run = notchedFrameRoom({}).walls[0].runs[0];
    run.top = 'stone';
    run.topSegments = [
      { id: 'wood', from: 'B', to: 'B', kind: 'wood', drop: 1, mode: 'overlap' },
      { id: 'ignored', from: 'A', to: 'B', kind: 'stone', drop: 1, mode: 'overlap' },
    ];
    const entries = [noteMember('top-rail', 2.5, ['B-upper']), noteMember('top-rail', 2.5, ['A'])];
    const scene = { cells: { pieces: [{ id: 'B-upper', columnId: 'B' }, { id: 'A' }] } };
    const before = structuredClone({ run, scene, entries });
    expect(frameReasons({}, {}, run, scene, REGION_D, entries, notchedFrameSettings, FLAT))
      .toEqual([{ ...entries[0], reason: 'wood overlap' }, entries[1]]);
    expect({ run, scene, entries }).toEqual(before);
  });

  it('requires a wider top rail over an active overlap segment', () => {
    const run = notchedFrameRoom({}).walls[0].runs[0];
    run.top = 'stone';
    const segment = { id: 's', from: 'B', to: 'B', kind: 'stone', drop: 1, mode: 'overlap' };
    const scene = { cells: { pieces: [{ id: 'B' }] } };
    const reasoned = (entries) => frameReasons({}, {}, run, scene, REGION_D,
      entries, notchedFrameSettings, FLAT);
    run.topSegments = [segment];
    const entries = [noteMember('top-rail', 1.5, ['B']), noteMember('top-rail', 1, ['B']),
      noteMember('mid-rail', 2.5, ['B'])];
    expect(reasoned(entries)).toEqual(entries);
    const wide = [noteMember('top-rail', 2.5, ['B'])];
    for (const change of [{ mode: 'box' }, { from: 'missing' }]) {
      run.topSegments = [{ ...segment, ...change }];
      expect(reasoned(wide)).toEqual(wide);
    }
    run.topSegments = [segment];
    run.top = 'none';
    expect(reasoned(wide)).toEqual(wide);
  });
});

describe('RP2.4 step b frame note text anchors', () => {
  const allTwo = changeWidths(noteFrame(), () => true, 2);
  const stilesTwo = changeWidths(noteFrame(), (member) => isStile(member.role), 2);
  const threeEighths = frameStandards({}, 0.375);
  const cases = [
    ['B1', noteFrame(), FLAT, 0, []],
    ['B2', allTwo, FLAT, 0, ['2" stiles & rails']],
    ['B3', stilesTwo, FLAT, 0, ['2" stiles, 1 1/2" rails']],
    ['B4', changeRole(noteFrame(), 'left-stile', 2.8125), FLAT, 0, ['2 13/16" left stile']],
    ['B5', changeRole(noteFrame(), 'stile', 2), FLAT, 0, ['2" stile @ #3/#4']],
    ['B6', noteFrame(BEADED), BEADED, 0.25, [BEADED_LINE]],
    ['B7', noteFrame(BEADED).filter((member) => member.role !== 'stile'
      && !member.sitsOn.includes('b')).concat(noteMember('right-stile', 1.75, ['a'])),
    BEADED, 0.25, ['beaded face frame - 1 3/4" stiles & rails']],
    ['B8', noteFrame(threeEighths), threeEighths, 0.375,
      ['beaded face frame (3/8" bead) - 1 7/8" outer stiles & rails, 2 1/4" interior stiles & rails']],
    ['B9', changeWidths(noteFrame(), (member) => member.role === 'bottom-rail'
      && member.sitsOn[0] === 'a', 2.25), FLAT, 0, ['2 1/4" bottom rail @ #3']],
    ['B10', changeRole(noteFrame(), 'bottom-rail', 2.25), FLAT, 0, ['2 1/4" bottom rail']],
    ['B11', changeRole(noteFrame(), 'stile', 2).concat(noteMember('stile', 2, ['b', 'c'])),
      FLAT, 0, ['2" stiles @ #3/#4, #4/#5']],
    ['B12', changeRole(noteFrame(), 'left-stile', 1.5625).map((member) => member.role === 'left-stile'
      ? { ...member, reason: 'mitered to 13/16" end panel' } : member), FLAT, 0,
    ['1 9/16" left stile (mitered to 13/16" end panel)']],
    ['B13', changeRole(changeRole(noteFrame(), 'left-stile', 2.5), 'right-stile', 2)
      .concat(noteMember('mid-rail', 2, ['a'])), FLAT, 0,
    ['2 1/2" left stile', '2" right stile', '2" mid rail @ #3']],
    ['B14', changeRole(noteFrame(BEADED), 'stile', 2.5), BEADED, 0.25,
      [BEADED_LINE, '2 1/2" stile @ #3/#4']],
    ['B15', allTwo.map((member) => member.role === 'left-stile'
      ? { ...member, reason: 'filler' } : member), FLAT, 0,
    ['2" left stile (filler)', '2" right stile', '2" top rail', '2" bottom rail', '2" stile @ #3/#4']],
  ];

  it.each(cases)('%s', (_case, entries, standards, bead, expected) => {
    expect(frameNotes(entries, standards, { bead, numberOf })).toEqual(expected);
  });
});

describe('RP2.4 step b frame note edge cases', () => {
  it('uses the strict difference threshold and rounds displayed widths to 1/32', () => {
    expect(frameNotes(changeRole(noteFrame(), 'left-stile', 1.5001), FLAT, { numberOf })).toEqual([]);
    expect(frameNotes(changeRole(noteFrame(), 'left-stile', 1.500101), FLAT, { numberOf }))
      .toEqual(['1 1/2" left stile']);
    expect(frameNotes(changeRole(noteFrame(), 'left-stile', 1.53), FLAT, { numberOf }))
      .toEqual(['1 17/32" left stile']);
  });

  it('sorts and deduplicates part numbers, skipping unnumbered boxes and absent locations', () => {
    const entries = changeRole(noteFrame(), 'stile', 2);
    entries[6].sitsOn = ['c', 'missing', 'a', 'c'];
    expect(frameNotes(entries, FLAT, { numberOf })).toEqual(['2" stile @ #3/#5']);
    expect(frameNotes(entries, FLAT, { numberOf: () => null })).toEqual(['2" stile']);
  });

  it('orders roles and locations numerically, including interior rail and mullion locations', () => {
    const entries = noteFrame().concat(
      noteMember('mullion', 2, ['b']),
      noteMember('mid-rail', 2, ['a']),
      noteMember('rail', 2, ['b', 'a']),
      noteMember('stile', 2.5, ['b', 'c']),
      noteMember('stile', 2, ['a', 'b']),
    ).reverse();
    const numbered = (id) => ({ a: 2, b: 10, c: 11 }[id]);
    expect(frameNotes(entries, FLAT, { numberOf: numbered })).toEqual([
      '2" stile @ #2/#10', '2 1/2" stile @ #10/#11', '2" rail @ #2/#10',
      '2" mid rail @ #2', '2" mullion @ #10',
    ]);
  });

  it('merges matching reasons and sorts merged locations while keeping other reasons separate', () => {
    const entries = noteFrame().concat(
      noteMember('stile', 2, ['b', 'c'], 'spacer'),
      noteMember('stile', 2, ['a', 'b'], 'spacer'),
      noteMember('stile', 2, ['c'], 'other'),
    );
    expect(frameNotes(entries, FLAT, { numberOf })).toEqual([
      '2" stiles @ #3/#4, #4/#5 (spacer)', '2" stile @ #5 (other)',
    ]);
  });

  it('keeps partial top and bottom rail groups singular with ordered bay locations', () => {
    const entries = changeWidths(noteFrame(), (member) => member.role === 'top-rail'
      && member.sitsOn[0] === 'b', 2).concat(
      noteMember('bottom-rail', 2.25, ['c']),
      noteMember('bottom-rail', 2.25, ['a']),
    );
    expect(frameNotes(entries, FLAT, { numberOf })).toEqual([
      '2" top rail @ #4', '2 1/4" bottom rail @ #3, #5',
    ]);
  });

  it('counts mullions as stiles and every rail role as rails for the summary', () => {
    const entries = changeWidths(noteFrame(), (member) => isStile(member.role), 2)
      .concat(noteMember('mullion', 2, ['a']), noteMember('mid-rail', 1.5, ['a']),
        noteMember('rail', 1.5, ['a', 'b']));
    expect(frameNotes(entries, FLAT, { numberOf })).toEqual(['2" stiles, 1 1/2" rails']);
    entries[0].reason = 'filler';
    expect(frameNotes(entries, FLAT, { numberOf })).toEqual([
      '2" left stile (filler)', '2" right stile', '2" stile @ #3/#4', '2" mullion @ #3',
    ]);
  });

  it('ignores reasons on standard members, does not mutate inputs, and handles no members', () => {
    const entries = changeRole(noteFrame(), 'stile', 2);
    entries[0].reason = 'filler';
    const before = structuredClone({ entries, standards: FLAT });
    expect(frameNotes(entries, FLAT, { numberOf })).toEqual(['2" stile @ #3/#4']);
    expect({ entries, standards: FLAT }).toEqual(before);
    expect(frameNotes([], FLAT, { numberOf })).toEqual([]);
  });
});

describe('ST2 step d notch rail roles and notes', () => {
  it.each([
    ['anchor 1: B top 2', 'top', 2, 0, 'top-rail', 31, ['2" notch @ #2']],
    ['anchor 2: beaded B top 2', 'top', 2, 0.25, 'top-rail', 30.75,
      [BEADED_LINE, '2" notch @ #2']],
    ['anchor 3: B bottom 3', 'bottom', 3, 0, 'bottom-rail', 7, ['3" notch @ #2']],
  ])('%s', (_case, edge, height, bead, role, z, notes) => {
    let room = notchedFrameRoom({ [edge]: { value: height, source: 'manual' } });
    const source = room.walls[0].runs[0];
    source.style = { cabinetStyleId: bead ? 15 : 14, beadWidth: bead };
    source._frame.bead = bead;
    // Beaded inset's standard seam is twice the bead; a zero seam narrows its interior stiles.
    if (bead) delete source.seamGap;
    room = syncRoom(room, notchedFrameSettings);
    const before = structuredClone(room);
    const wall = resolveWall(room, room.walls[0], 'front');
    const scene = runScene(room, wall, wall.runs[0], notchedFrameSettings);
    const [region] = scene.frames.regions;
    expect(region.notches).toEqual([{
      columnId: 'B', edge, x: bead ? 31.25 : 31, z: edge === 'top' ? 32.5 : 4,
      width: bead ? 27.5 : 28, height,
    }]);
    const entries = frameMemberRoles(region,
      frameMembers(region, regionOpenings(region, scene.faceLayouts)), scene.cells.pieces);
    expect(entries.find((entry) => entry.kind === 'rail' && entry.sitsOn.includes('B') && entry.z === z))
      .toMatchObject({ role, height: 1.5 + bead });
    const rows = shippingList(room, notchedFrameSettings).rows;
    expect(rows.filter(({ key }) => ['A', 'B', 'C'].includes(key)).map(({ key, number }) => [key, number]))
      .toEqual([['A', 1], ['B', 2], ['C', 3]]);
    expect(rows.filter(({ kind }) => kind === 'frame')).toMatchObject([
      { notes: [...notes,
        `6" right return, ${height}" tall ${edge === 'top' ? 'above' : 'below'} cabinet #2`,
        `6" left return, ${height}" tall ${edge === 'top' ? 'above' : 'below'} cabinet #2`,
      ], size: '90 x 30 1/2 x 13/16' },
    ]);
    expect(room).toEqual(before);
  });

  it('requires a matching notch edge and positive x overlap, allowing the edge tolerance', () => {
    const region = { ...REGION_D, notches: [
      { edge: 'top', x: 10, z: 20, width: 10, height: 10 },
      { edge: 'bottom', x: 10, z: 0, width: 10, height: 5 },
    ] };
    const rail = (x, z, width = 5) => ({ kind: 'rail', x, z, width, height: 1.5 });
    const members = [
      rail(10, 18.5), rail(10, 18.5 + 0.5e-6), rail(10, 18.5 + 2e-6),
      rail(5, 18.5), rail(20, 18.5), rail(5 + 0.5e-6, 18.5),
      rail(10, 5), rail(10, 5 - 0.5e-6), rail(10, 5 - 2e-6),
      rail(5, 5), rail(20, 5), rail(10, 20), rail(10, 3.5),
    ];
    expect(frameMemberRoles(region, members, []).map(({ role }) => role)).toEqual([
      'top-rail', 'top-rail', 'mid-rail', 'mid-rail', 'mid-rail', 'mid-rail',
      'bottom-rail', 'bottom-rail', 'mid-rail', 'mid-rail', 'mid-rail', 'mid-rail', 'mid-rail',
    ]);
  });

  it('orders notches by edge then x and references the cabinet nearest each notch in a nested column', () => {
    const region = { ...REGION_D, z: 4, width: 60, height: 30.5,
      cabinetIds: ['a', 'b-top', 'b-bottom'], notches: [
      { columnId: 'B', edge: 'bottom', x: 31, z: 4, width: 27.5, height: 3 },
      { columnId: 'B', edge: 'top', x: 31, z: 32.5, width: 27.5, height: 2 },
      { columnId: 'a', edge: 'top', x: 1.5, z: 33.25, width: 28, height: 1.25 },
    ] };
    const boxes = [
      { id: 'outside', columnId: 'B', x: 30.25, z: 0, width: 29, height: 100 },
      { id: 'b-bottom', columnId: 'B', x: 30.25, z: 7, width: 29, height: 10 },
      { id: 'b-top', columnId: 'B', x: 30.25, z: 17, width: 29, height: 15.5 },
      { id: 'a', x: 0.75, z: 4, width: 29.5, height: 29.25 },
    ];
    const before = structuredClone({ region, boxes });
    const numbered = (id) => ({ a: 1, 'b-top': 2, 'b-bottom': 3 }[id]);
    expect(frameNotchNotes(region, boxes, numbered))
      .toEqual(['1 1/4" notch @ #1', '2" notch @ #2', '3" notch @ #3']);
    expect(frameNotchNotes(REGION_D, boxes, numbered)).toEqual([]);
    expect(frameNotchNotes(undefined, boxes, numbered)).toEqual([]);
    expect(frameNotchNotes(region, boxes, () => null)).toEqual([]);
    expect({ region, boxes }).toEqual(before);
  });

  it('appends notch notes after return notes on the shipping frame', () => {
    const room = notchedFrameRoom();
    const run = room.walls[0].runs[0];
    findLeaf(run.grid, 'A').kind = 'void';
    findLeaf(run.grid, 'B').insideEnds = { left: { type: 'return' } };
    const rows = shippingList(syncRoom(room, notchedFrameSettings), notchedFrameSettings).rows;
    expect(rows.filter(({ kind }) => kind === 'frame')).toMatchObject([
      { notes: ['6" left return', '2" notch @ #1', '6" left return, 2" tall above cabinet #1'] },
    ]);
    expect(rows.filter(({ kind }) => kind !== 'frame').flatMap(({ notes }) => notes))
      .not.toContain('2" notch @ #1');
  });
});
