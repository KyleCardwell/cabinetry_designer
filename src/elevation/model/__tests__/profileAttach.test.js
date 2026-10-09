import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { setProfileAttach, setProfileKind } from '../profileEditing.js';

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

  it('changes the kind and drops pin points the new kind does not use', () => {
    expect(setProfileKind(COVE, 'door_outside')).toEqual({ ...COVE, kind: 'door_outside', attach: {} });
    expect(setProfileKind(BEAD, 'applied_molding')).toEqual({ ...BEAD, attach: { apply_point: 's' } });
    expect(setProfileKind(CROWN, 'top_mold')).toEqual({ ...CROWN, kind: 'top_mold' });
    expect(setProfileKind(CROWN, 'nosing')).toEqual({ ...CROWN, kind: 'nosing', attach: {} });
    expect(setProfileKind(COVE, 'other')).toEqual({ ...COVE, kind: 'other', attach: {} });
    expect(setProfileKind(COVE, 'door_inside')).toEqual(COVE);
    expect([setProfileKind(COVE, 'door_applied'), setProfileKind(COVE, ''), setProfileKind(COVE, undefined)])
      .toEqual([null, null, null]);
    expect(COVE.kind).toBe('door_inside');
  });
});
