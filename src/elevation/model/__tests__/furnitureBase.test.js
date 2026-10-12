import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { hasToeKick } from '../bandDepths.js';
import { runBase } from '../furnitureBase.js';
import { runBands } from '../runBands.js';
import { runSide } from '../runSide.js';
import { runScene } from '../runScene.js';
import { carriesMolding } from '../parts.js';
import { partNumbers, wallMoldingBadges } from '../partNumbers.js';
import { resolveProfile } from '../profile.js';
import { resolveWall, syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const { profiles } = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const fb4 = profiles.find(({ id }) => id === 'fb4');
const settings = { ...DEFAULT_SETTINGS, sectionProfiles: profiles };
const room = { profile: { baseKind: 'furniture_base', furnitureBaseProfileId: 'fb4' } };
const run = { cabinetTypeId: CABINET_TYPE_IDS.BASE, overrides: {} };
const baseAt = (height, using = settings) => runBase(room, {}, {
  ...run, overrides: { toeKickHeight: height },
}, using);

describe('SPEC-50.5 runBase resolver', () => {
  it('resolves the default toe kick (anchor 1)', () => {
    expect(runBase({}, {}, run, settings)).toEqual({
      kind: 'toe_kick', height: 4, proud: 0.8125, picked: null, warnings: [],
    });
  });

  it('uses the room furniture base profile as drawn at height 4 (anchor 2)', () => {
    expect(runBase(room, {}, run, settings)).toEqual({
      kind: 'furniture_base', height: 4, proud: 0.8125,
      picked: { profile: fb4, geometry: fb4.geometry }, warnings: [],
    });
  });

  it('stretches only the points below the line to height 6 without changing the pick (anchor 3)', () => {
    const before = structuredClone(fb4);
    expect(baseAt(6)).toEqual({
      kind: 'furniture_base', height: 6, proud: 0.8125,
      picked: { profile: fb4, geometry: {
        ...fb4.geometry,
        points: { ...fb4.geometry.points, d: [0, -6], e: [-0.8125, -6] },
      } }, warnings: [],
    });
    expect(fb4).toEqual(before);
  });

  it('warns and keeps the drawn geometry when height does not reach the stretch line (anchor 4)', () => {
    for (const height of [1.5, 2]) {
      expect(baseAt(height)).toMatchObject({
        height, picked: { geometry: fb4.geometry },
        warnings: [{ code: 'furniture-base-too-short' }],
      });
    }
  });

  it('warns only on a height mismatch when the profile has no stretch line (anchor 5)', () => {
    const plain = { ...fb4 };
    delete plain.stretch;
    const using = { ...settings, sectionProfiles: [plain] };
    expect(baseAt(6, using)).toMatchObject({
      height: 6, picked: { profile: plain, geometry: fb4.geometry },
      warnings: [{ code: 'furniture-base-height-mismatch' }],
    });
    expect(baseAt(4, using).warnings).toEqual([]);
  });

  it('gives no base to uppers, stacked runs or a zero base height (anchor 6)', () => {
    for (const change of [
      { cabinetTypeId: CABINET_TYPE_IDS.UPPER },
      { stack: { below: 'lower' } },
      { overrides: { toeKickHeight: 0 } },
    ]) {
      expect(runBase(room, {}, { ...run, ...change }, settings)).toEqual({
        kind: null, height: change.overrides ? 0 : 4, proud: 0.8125, picked: null, warnings: [],
      });
    }
    expect(runBase(room, {}, { ...run, cabinetTypeId: CABINET_TYPE_IDS.TALL }, settings).kind)
      .toBe('furniture_base');
    expect(hasToeKick(run)).toBe(true);
  });

  it('suppresses furniture-base toe kicks and restores drawing and TK numbering on override (anchor 7)', () => {
    const document = normalizeElevationDocument(JSON.parse(
      readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8'),
    ));
    const stored = document.rooms.find(({ name }) => name === 'G1 Euro kitchen');
    stored.profile = { ...stored.profile, ...room.profile };
    const using = { ...document.settings, sectionProfiles: profiles };
    const resolved = syncRoom(stored, using);
    const wall = resolveWall(resolved, resolved.walls[0], 'front');
    const base = wall.runs.find(({ cabinetTypeId }) => cabinetTypeId === CABINET_TYPE_IDS.BASE);
    const drawn = () => runBands(resolved, wall, base, using, runScene(resolved, wall, base, using));
    expect(runBase(resolved, wall, base, using).kind).toBe('furniture_base');
    expect(drawn().toeKicks).toEqual([]);
    expect(runSide(resolved, wall, base, using).some(({ piece }) => piece === 'toe_kick')).toBe(false);
    expect(carriesMolding(wall, base, resolveProfile(using, resolved, wall), 'toeKick')).toBe(false);
    expect(partNumbers(resolved, using).byKey.has('molding:toeKick')).toBe(false);

    base.overrides.baseKind = 'toe_kick';
    const storedBase = resolved.walls[0].runs.find(({ id }) => id === base.id);
    storedBase.overrides.baseKind = 'toe_kick';
    expect(runBase(resolved, wall, base, using).kind).toBe('toe_kick');
    expect(drawn().toeKicks[0]).toMatchObject({ z: 0, height: 4 });
    expect(runSide(resolved, wall, base, using).some(({ piece }) => piece === 'toe_kick')).toBe(true);
    const numbers = partNumbers(resolved, using);
    expect(numbers.byKey.has('molding:toeKick')).toBe(true);
    expect(wallMoldingBadges(resolved, wall, using, numbers.byKey))
      .toContainEqual(expect.objectContaining({ molding: 'toeKick', label: 'TK' }));
    expect(carriesMolding(wall, { ...base, stack: { below: 'lower' } },
      resolveProfile(using, resolved, wall), 'toeKick')).toBe(false);
  });

  it('inherits team, room and wall fields and applies run overrides including zero proud and cleared picks', () => {
    const using = { ...settings, defaultProfile: {
      baseKind: 'furniture_base', toeKickHeight: 6, furnitureBaseProud: 1,
      furnitureBaseProfileId: 'fb4',
    } };
    const inheritedRoom = { profile: { toeKickHeight: 5, furnitureBaseProud: 2 } };
    const wall = { profile: { toeKickHeight: 4, furnitureBaseProud: 3 } };
    expect(runBase(inheritedRoom, wall, { ...run, overrides: {
      baseKind: null, toeKickHeight: undefined, furnitureBaseProud: null,
      furnitureBaseProfileId: undefined,
    } }, using)).toMatchObject({
      kind: 'furniture_base', height: 4, proud: 3, picked: { profile: fb4 }, warnings: [],
    });
    expect(runBase(inheritedRoom, wall, { ...run, overrides: {
      toeKickHeight: 6, furnitureBaseProud: 0, furnitureBaseProfileId: null,
    } }, using)).toEqual({ kind: 'furniture_base', height: 6, proud: 0, picked: null, warnings: [] });
  });

  it('warns for missing and wrong-kind picks, while a plain board needs no warning', () => {
    for (const id of ['missing', 'tm3']) {
      expect(runBase(room, {}, { ...run, overrides: { furnitureBaseProfileId: id } }, settings))
        .toMatchObject({ picked: null, warnings: [{ code: 'molding-profile-missing', slot: 'furniture_base' }] });
    }
    expect(runBase({ profile: { baseKind: 'furniture_base' } }, {}, run, settings))
      .toEqual({ kind: 'furniture_base', height: 4, proud: 0.8125, picked: null, warnings: [] });
  });
});
