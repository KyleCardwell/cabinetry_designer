import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { profileSlotGaps, setProfileAttach } from '../profileEditing.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const [COVE, BEAD, CROWN] = sample.profiles;

describe('SPEC-48.1 editing attach points', () => {
  it('sets, replaces and clears an attach point, keeping the key order and everything else', () => {
    const added = setProfileAttach(COVE, 'door_edge', 'e');
    expect(added.attach).toEqual({ frame_edge: 'a', door_edge: 'e' });
    expect(Object.keys(added.attach)).toEqual(['frame_edge', 'door_edge']);
    expect([added.geometry, added.drawnPoints, added.version]).toEqual([COVE.geometry, COVE.drawnPoints, 1]);
    expect(COVE.attach).toEqual({ frame_edge: 'a' });
    const replaced = setProfileAttach(BEAD, 'frame_edge', 't');
    expect(replaced.attach).toEqual({ frame_edge: 't', apply_point: 's' });
    expect(Object.keys(replaced.attach)).toEqual(['frame_edge', 'apply_point']);
    expect(setProfileAttach(CROWN, 'box_front', 'c5').attach).toEqual({ box_top: 'c1', box_front: 'c5' });
    expect(setProfileAttach(BEAD, 'apply_point', null).attach).toEqual({ frame_edge: 's' });
    expect(setProfileAttach(COVE, 'frame_edge', null).attach).toEqual({});
    expect(setProfileAttach(setProfileAttach(COVE, 'frame_edge', null), 'frame_edge', 'a')).toEqual(COVE);
    expect(setProfileAttach(COVE, 'door_edge', null)).toEqual(COVE);
    expect(setProfileAttach(COVE, 'frame_edge', 'a')).toEqual(COVE);
  });

  it('refuses an unknown attach name, an unknown point, or a value that is not a point id or null', () => {
    expect([
      setProfileAttach(COVE, 'sticking', 'a'),
      setProfileAttach(COVE, '', 'a'),
      setProfileAttach(COVE, 'frame_edge', 'q'),
      setProfileAttach(COVE, 'frame_edge', undefined),
      setProfileAttach(COVE, 'frame_edge', 3),
    ]).toEqual([null, null, null, null, null]);
  });

  it('reports tagged slots the attach points do not fit yet, with the names still missing', () => {
    expect([COVE, BEAD, CROWN].map((profile) => profileSlotGaps(profile))).toEqual([[], [], []]);
    const tagged = { ...COVE, tags: ['door_inside', 'door_outside', 'crown', 'shop_ogee', 'door_panel'] };
    expect(profileSlotGaps(tagged)).toEqual([
      { tag: 'door_outside', slot: 'door_outside', missing: ['door_edge'] },
      { tag: 'crown', slot: 'crown', missing: ['box_top', 'box_front'] },
      { tag: 'door_panel', slot: 'door_panel', missing: ['panel_edge'] },
    ]);
    const half = { ...CROWN, tags: ['crown', 'top_mold', 'toe_kick'], attach: { box_top: 'c1' } };
    expect(profileSlotGaps(half)).toEqual([
      { tag: 'crown', slot: 'crown', missing: ['box_front'] },
      { tag: 'top_mold', slot: 'top_mold', missing: ['box_front'] },
      { tag: 'toe_kick', slot: 'toe_kick', missing: ['floor', 'box_front'] },
    ]);
    expect(profileSlotGaps({ ...COVE, tags: ['door_applied'], attach: {} }))
      .toEqual([{ tag: 'door_applied', slot: 'door_applied', missing: ['frame_edge'] }]);
    expect(profileSlotGaps({ ...COVE, tags: ['door_applied'], attach: { panel_edge: 'a' } })).toEqual([]);
    expect(profileSlotGaps({ ...COVE, tags: [] })).toEqual([]);
  });
});
