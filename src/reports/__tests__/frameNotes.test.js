import { describe, expect, it } from 'vitest';
import { frameMembers } from '../../elevation/model/frames.js';
import { frameMemberRoles, frameNotes, frameStandards } from '../frameNotes.js';

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
