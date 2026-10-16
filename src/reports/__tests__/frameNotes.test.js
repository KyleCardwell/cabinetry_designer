import { describe, expect, it } from 'vitest';
import { frameMembers } from '../../elevation/model/frames.js';
import { frameMemberRoles, frameStandards } from '../frameNotes.js';

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
