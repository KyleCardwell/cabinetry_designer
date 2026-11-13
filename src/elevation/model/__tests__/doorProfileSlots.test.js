import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DOOR_PROFILE_SLOTS } from '../doorStyles.js';
import { doorProfileChoices, doorProfileSlotKind, isSectionProfile, newSectionProfile } from '../sectionProfiles.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const [COVE, BEAD, CROWN] = sample.profiles;
const SQUARE = { id: null, name: 'Square', note: null };

describe('SPEC-48.3 door style profile slots', () => {
  it('gives each door style slot its profile kind', () => {
    expect(DOOR_PROFILE_SLOTS.map((slot) => doorProfileSlotKind(slot)))
      .toEqual(['door_outside', 'door_inside', 'door_panel', 'applied_molding']);
    expect([doorProfileSlotKind('crown'), doorProfileSlotKind('door_inside'), doorProfileSlotKind('toString'), doorProfileSlotKind(undefined)])
      .toEqual([null, null, null, null]);
  });

  it('lists Square (None for applied), the live profiles of the slot\'s kind, then a pick that no longer fits', () => {
    const cove2 = { ...COVE, id: 'sp-cove-2', name: 'Cove 3/8' };
    const old = { ...COVE, id: 'sp-old', name: 'Old cove', archived: true };
    const list = [COVE, BEAD, CROWN, old, cove2];
    const inside = [SQUARE, { id: 'sp-cove', name: 'Cove 1/4', note: null }, { id: 'sp-cove-2', name: 'Cove 3/8', note: null }];
    expect(doorProfileChoices(list, 'inside', null)).toEqual(inside);
    expect([doorProfileChoices(list, 'inside', undefined), doorProfileChoices(list, 'inside', 'sp-cove-2')]).toEqual([inside, inside]);
    expect(doorProfileChoices(list, 'inside', 'sp-old')).toEqual([...inside, { id: 'sp-old', name: 'Old cove', note: 'archived' }]);
    expect(doorProfileChoices(list, 'inside', 'sp-crown').at(-1)).toEqual({ id: 'sp-crown', name: 'Crown 4 1/2', note: 'wrong kind' });
    expect(doorProfileChoices([{ ...CROWN, archived: true }], 'inside', 'sp-crown'))
      .toEqual([SQUARE, { id: 'sp-crown', name: 'Crown 4 1/2', note: 'wrong kind' }]);
    expect(doorProfileChoices(list, 'inside', 'gone').at(-1)).toEqual({ id: 'gone', name: 'Missing profile', note: 'missing' });
    expect(doorProfileChoices(list, 'applied', null))
      .toEqual([{ id: null, name: 'None', note: null }, { id: 'sp-bead', name: 'Half bead', note: null }]);
    expect([doorProfileChoices(list, 'outside', null), doorProfileChoices(list, 'panel', null), doorProfileChoices(list, 'crown', null)])
      .toEqual([[SQUARE], [SQUARE], []]);
  });

  it('starts a new square profile of a kind, named for the kind', () => {
    const made = newSectionProfile([COVE], 'sp-new', null, 'door_inside');
    expect([made.id, made.name, made.kind, made.version, made.archived, isSectionProfile(made)])
      .toEqual(['sp-new', 'New door inside profile', 'door_inside', 1, false, true]);
    expect([made.geometry, made.drawnPoints]).toEqual([newSectionProfile([], 'x').geometry, { elevation: [] }]);
    expect(newSectionProfile([made], 'sp-2', null, 'door_inside').name).toBe('New door inside profile 2');
    expect([
      newSectionProfile([], 'a', null, 'applied_molding').name,
      newSectionProfile([], 'b', null, 'other').name,
      newSectionProfile([], 'c', null, 'nope').name,
      newSectionProfile([], 'd').name,
    ]).toEqual(['New applied molding', 'New profile', 'New profile', 'New profile']);
    expect([newSectionProfile([], 'c', null, 'nope').kind, newSectionProfile([], 'e', null, null).kind]).toEqual(['other', 'other']);
    expect(newSectionProfile([COVE], 'f', COVE, 'crown')).toMatchObject({ id: 'f', name: 'Cove 1/4 copy', kind: 'door_inside' });
  });
});
