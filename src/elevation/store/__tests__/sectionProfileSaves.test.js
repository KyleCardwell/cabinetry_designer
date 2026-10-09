import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { parseProfileFile } from '../../model/sectionProfiles.js';
import { isElevationDocument, normalizeElevationDocument } from '../persistence.js';
import { copySettings } from '../slices/helpers.js';

const golden = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/golden.json', import.meta.url), 'utf8'));
const sample = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/sectionProfiles.json', import.meta.url), 'utf8'));

/** The golden document as saved before round 47: no profile library. */
function older() {
  const document = structuredClone(golden);
  delete document.settings.sectionProfiles;
  return document;
}

describe('SPEC-47 saving the profile library in settings', () => {
  it('gives an older document an empty profile library', () => {
    const loaded = normalizeElevationDocument(older());
    expect(loaded.settings.sectionProfiles).toEqual([]);
    expect(loaded.settings.sectionProfiles).not.toBe(DEFAULT_SETTINGS.sectionProfiles);
    expect(isElevationDocument(loaded)).toBe(true);
  });

  it('keeps a saved library and rejects a broken one', () => {
    const saved = older();
    saved.settings.sectionProfiles = sample.profiles;
    expect(normalizeElevationDocument(saved).settings.sectionProfiles).toEqual(sample.profiles);
    const valid = (sectionProfiles) => {
      const loaded = normalizeElevationDocument(older());
      loaded.settings.sectionProfiles = sectionProfiles;
      return isElevationDocument(loaded);
    };
    expect([
      valid(sample.profiles),
      valid([]),
      valid(undefined),
      valid([{ ...sample.profiles[0], version: 0 }]),
      valid([sample.profiles[0], sample.profiles[0]]),
    ]).toEqual([true, true, false, false, false]);
  });

  it('copies the library into the state so it never shares objects', () => {
    const copy = copySettings({ ...DEFAULT_SETTINGS, sectionProfiles: sample.profiles });
    expect(copy.sectionProfiles).toEqual(sample.profiles);
    expect([copy.sectionProfiles === sample.profiles, copy.sectionProfiles[0].geometry === sample.profiles[0].geometry])
      .toEqual([false, false]);
    expect([
      copySettings(DEFAULT_SETTINGS).sectionProfiles,
      copySettings({ ...DEFAULT_SETTINGS, sectionProfiles: undefined }).sectionProfiles,
    ]).toEqual([[], []]);
    expect(copySettings(DEFAULT_SETTINGS).sectionProfiles).not.toBe(DEFAULT_SETTINGS.sectionProfiles);
  });

  it('turns an older library\'s tags into kinds, on load and on import', () => {
    const old = { ...sample.profiles[0], tags: ['shop_ogee', 'door_inside'], attach: { frame_edge: 'a', door_edge: 'e' } };
    delete old.kind;
    const saved = older();
    saved.settings.sectionProfiles = [old];
    const loaded = normalizeElevationDocument(saved);
    expect(loaded.settings.sectionProfiles).toEqual([sample.profiles[0]]);
    expect(isElevationDocument(loaded)).toBe(true);
    expect(parseProfileFile(JSON.stringify({ kind: 'section-profiles', version: 1, profiles: [old] })))
      .toEqual([sample.profiles[0]]);
  });

  it('moves an older profile\'s pin point to 0, 0 and drops the pins, on load and on import', () => {
    const old = { ...sample.profiles[0], kind: 'door_outside', attach: { door_edge: 'e' } };
    const saved = older();
    saved.settings.sectionProfiles = [old];
    const loaded = normalizeElevationDocument(saved);
    const [profile] = loaded.settings.sectionProfiles;
    expect(profile.geometry.points).toEqual({ a: [0, 0.8125], b: [0.5, 0.8125], c: [0.75, 0.5625], d: [0.75, 0], e: [0, 0] });
    expect(profile.geometry.loops[0].segs[1].center).toEqual([0.5, 0.5625]);
    expect([Object.hasOwn(profile, 'attach'), isElevationDocument(loaded)]).toEqual([false, true]);
    expect(parseProfileFile(JSON.stringify({ kind: 'section-profiles', version: 1, profiles: [old] }))).toEqual([profile]);
  });
});
