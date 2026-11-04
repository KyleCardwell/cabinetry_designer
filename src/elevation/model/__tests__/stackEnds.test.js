import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { isInteriorNode, isRollouts, isShelfSettings, patchShelfSettings,
  setSectionRollouts, setSectionShelves } from '../interiorTree.js';
import { sectionRollouts } from '../rollouts.js';
import { sectionShelves } from '../shelves.js';
import { BUILT_IN_SLIDES } from '../slides.js';

const settings = { ...DEFAULT_SETTINGS, slides: BUILT_IN_SLIDES, drawerSlideId: 'blum-562h' };

// These are already-resolved sections, so no room/run construction is needed.
function input(picks, z = 0) {
  const section = { path: 'r', x: 0, z, width: 24, height: 30, depth: 23 };
  return { interior: { tree: picks, sections: [section] },
    faces: [{ ...section, type: 'door', hinge: 'left' }], leaf: {}, settings };
}

describe('IN15c step a stack ends', () => {
  it.each([
    [1, {}, 1, [14.625], 14.625],
    [2, { bottom: 12 }, 1, [12], 17.25],
    [3, { count: 2, bottom: 12, top: 0 }, 2, [12, 29.25], 16.5],
  ])('anchor %i: places adjustable shelves from section edges', (_case, shelves, count, positions, gap) => {
    for (const z of [0, 40]) {
      const args = input({ shelves }, z);
      const before = structuredClone(args);
      expect(sectionShelves(args).get('r')).toMatchObject({ count, gap,
        positions: positions.map((at) => z + at), warnings: [],
        bottomSource: shelves.bottom === undefined ? 'auto' : 'manual',
        topMode: shelves.top === undefined ? 'equal' : 'fromTop' });
      expect(args).toEqual(before);
    }
    if (_case === 2) {
      expect(sectionShelves(input({ shelves: { ...shelves, count: 2 } })).get('r').gap).toBe(8.25);
    }
  });

  it.each([
    [4, { count: 2 }, [0.5625, 15.28125], 10.46875],
    [5, { count: 2, top: 18 }, [0.5625, 7.75], 2.9375],
    [6, { count: 2, bottom: 2 }, [2, 16], 9.75],
    [7, { count: 2, bottom: 2, items: [{ at: 3 }] }, [3, 16.5], 9.25],
  ])('anchor %i: places roll-out boxes from section edges', (_case, rollouts, positions, gap) => {
    for (const z of [0, 40]) {
      const args = input({ rollouts }, z);
      const before = structuredClone(args);
      const result = sectionRollouts(args).get('r');
      expect(result.gap).toBe(gap);
      expect(result.rollouts.map(({ at }) => at)).toEqual(positions);
      expect(result.rollouts.map((box) => box.z)).toEqual(positions.map((at) => z + at));
      expect(result.warnings).toEqual([]);
      expect(args).toEqual(before);
    }
  });

  it('validates section-only ends, clears them with null and preserves unrelated picks', () => {
    for (const key of ['bottom', 'top']) {
      for (const value of [0, 0.5625, 1000]) {
        expect(isShelfSettings({ [key]: value }, true)).toBe(true);
        expect(isInteriorNode({ shelves: { [key]: value } })).toBe(true);
        expect(isShelfSettings({ [key]: value })).toBe(false);
        expect(patchShelfSettings({}, { [key]: value })).toBeNull();
        expect(isRollouts({ count: 2, [key]: value })).toBe(true);
        const shelf = { shelves: { glass: true } };
        const pickedShelf = setSectionShelves(shelf, 'r', { [key]: value });
        expect(pickedShelf).toEqual({ shelves: { glass: true, [key]: value } });
        expect(setSectionShelves(pickedShelf, 'r', { [key]: null })).toEqual(shelf);
        const rollout = { rollouts: { count: 2, items: [{ at: 3 }] } };
        const pickedRollout = setSectionRollouts(rollout, 'r', { [key]: value });
        expect(pickedRollout).toEqual({ rollouts: { ...rollout.rollouts, [key]: value } });
        expect(setSectionRollouts(pickedRollout, 'r', { [key]: null })).toEqual(rollout);
        expect(rollout).toEqual({ rollouts: { count: 2, items: [{ at: 3 }] } });
      }
      expect(patchShelfSettings({}, { [key]: null })).toBeNull();
      expect(setSectionShelves({ shelves: { [key]: 1 } }, 'r', { [key]: null })).toEqual({});
      for (const value of [-1, Infinity, -Infinity, NaN, '2', undefined, null]) {
        expect(isShelfSettings({ [key]: value }, true)).toBe(false);
        expect(isRollouts({ count: 2, [key]: value })).toBe(false);
        if (value === null) continue;
        const tree = { shelves: { count: 2 }, rollouts: { count: 2 } };
        expect(setSectionShelves(tree, 'r', { [key]: value })).toBe(tree);
        expect(setSectionRollouts(tree, 'r', { [key]: value })).toBe(tree);
      }
    }
    const tree = { direction: 'vertical', children: [{}, {}], dividers: [{ kind: 'zone' }] };
    expect(setSectionShelves(tree, 'r', { bottom: 1 })).toBe(tree);
    expect(setSectionRollouts(tree, 'r', { count: 2, top: 1 })).toBe(tree);
  });

  it('uses visible shelf height, keeps eligibility and reports ignored tops and negative gaps', () => {
    const nosed = input({ shelves: { count: 2, bottom: 12, top: 0, nosing: 'hardwood' } });
    expect(sectionShelves(nosed).get('r')).toMatchObject({ positions: [12, 28.5], gap: 15 });
    expect(sectionShelves(input({ shelves: { top: 4 } })).get('r'))
      .toMatchObject({ positions: [12.25, 25.25], gap: 12.25, topMode: 'fromTop' });
    expect(sectionShelves(input({ shelves: { bottom: 12, top: 0 } })).get('r'))
      .toMatchObject({ count: 2, positions: [12, 29.25] });
    expect(sectionShelves(input({ shelves: { count: 1, bottom: 12, top: 0 } })).get('r'))
      .toMatchObject({ positions: [12], gap: null, warnings: [{ code: 'stack-top-ignored' }] });
    expect(sectionShelves(input({ shelves: { count: 2, bottom: 29, top: 0 } })).get('r'))
      .toMatchObject({ gap: -0.5, warnings: [{ code: 'stack-doesnt-fit' }, { code: 'shelves-crowded' }] });
    expect(sectionShelves(input({ shelves: { bottom: 30 } })).get('r'))
      .toMatchObject({ count: 0, positions: [], gap: null });
    for (const purpose of ['sink', 'cooktop', 'oven']) {
      const args = input({ shelves: { bottom: 0, top: 0 } });
      args.leaf.purpose = purpose;
      expect(sectionShelves(args).get('r').count).toBe(0);
    }
    const args = input({ shelves: { bottom: 0, top: 0 } });
    args.accessories = new Map([['r', { whole: true }]]);
    expect(sectionShelves(args).get('r').count).toBe(0);
    args.accessories = new Map();
    args.faces = [];
    expect(sectionShelves(args).get('r').count).toBe(0);
  });

  it('measures picks from section edges while retaining drawer, roll-out and shoe bands', () => {
    const args = input({ shelves: { count: 2, bottom: 2, top: 1 } }, 40);
    args.boxes = [{ space: { x: 0, z: 65, width: 24, height: 5 } }];
    args.rollouts = new Map([['r', { top: 50 }]]);
    expect(sectionShelves(args).get('r')).toMatchObject({ zone: { z: 50, height: 15 },
      positions: [42, 68.25], warnings: [{ code: 'shelves-into-fills' }] });
    const shoes = input({ shelves: { count: 1, shoe: 2, bottom: 0 } });
    const before = sectionShelves(input({ shelves: { count: 1, shoe: 2 } })).get('r');
    const after = sectionShelves(shoes).get('r');
    expect(after.shoe).toEqual(before.shoe);
    expect(after.zone).toEqual(before.zone);
    expect(after.positions).toEqual([0]);
    expect(after.warnings).toContainEqual({ code: 'shelves-into-fills' });
  });

  it('keeps typed box ends and intermediate runs, including variable heights and null gaps', () => {
    const args = input({ rollouts: { count: 5, bottom: 2, top: 1,
      items: [{}, { at: 10 }, {}, { at: 22 }, { height: 2 }] } }, 40);
    args.boxes = [{ space: { x: 0, z: 66, width: 24, height: 4 } }];
    const result = sectionRollouts(args).get('r');
    expect(result.zone).toEqual({ z: 40, height: 26 });
    expect(result.rollouts.map(({ at }) => at)).toEqual([2, 10, 16, 22, 27]);
    expect(result.gap).toBe(0.75);
    expect(result.warnings).toContainEqual({ code: 'rollout-outside', index: 4 });
    const typed = sectionRollouts(input({ rollouts: { count: 2, bottom: 2, top: 18,
      items: [{ at: 3 }, { at: 20 }] } })).get('r');
    expect(typed.rollouts.map(({ at }) => at)).toEqual([3, 20]);
    expect(typed.gap).toBeNull();
    const typedTop = sectionRollouts(input({ rollouts: { count: 2, bottom: 2, top: 18,
      items: [{}, { at: 20 }] } })).get('r');
    expect(typedTop.rollouts.map(({ at }) => at)).toEqual([2, 20]);
    expect(typedTop.gap).toBe(13.75);
    expect(sectionRollouts(input({ rollouts: { count: 1, bottom: 2, top: 18 } })).get('r'))
      .toMatchObject({ gap: null, warnings: [{ code: 'stack-top-ignored' }] });
    const crowded = sectionRollouts(input({ rollouts: { count: 2, bottom: 2, top: 24 } })).get('r');
    expect(crowded.gap).toBe(-4.5);
    expect(crowded.warnings).toContainEqual({ code: 'stack-doesnt-fit' });
    expect(crowded.warnings.map(({ code }) => code)).toContain('rollouts-overlap');
  });
});
